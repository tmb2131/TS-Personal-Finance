import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './supabase/server';

/** Tables that are global (no user_id): FX only. All others get user_id on sync. */
const GLOBAL_TABLES = new Set(['fx_rates', 'fx_rate_current']);
function isGlobalTable(table: string): boolean {
  return GLOBAL_TABLES.has(table);
}

const BATCH_SIZE = 1000;

/** Split an array into chunks of at most `size` for batched DB operations. */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/** Tables that use delete-all-then-insert (no upsert key). */
const DELETE_INSERT_TABLES = new Set([
  'debt', 'budget_targets', 'annual_trends', 'monthly_trends',
  'investment_return', 'yoy_net_worth', 'recurring_payments',
]);

interface SheetConfig {
  name: string;
  range: string;
  table: string;
  transform?: (row: any[]) => any;
}

// Configure sheet ranges and table mappings
const SHEET_CONFIGS: SheetConfig[] = [
  {
    name: 'Account Balances',
    range: 'A:K',
    table: 'account_balances',
    transform: (row) => {
      const date = row[0] ? new Date(row[0]) : null;
      if (!date || isNaN(date.getTime())) return null;
      return {
        date_updated: date,
        institution: row[1] || '',
        account_name: row[2] || '',
        category: row[3] || '',
        currency: row[4] || 'USD',
        balance_personal_local: parseFloat(row[5] || '0'),
        balance_family_local: parseFloat(row[6] || '0'),
        balance_total_local: parseFloat(row[7] || '0'),
        liquidity_profile: (row[8] && row[8].trim()) || null,
        risk_profile: (row[9] && row[9].trim()) || null,
        horizon_profile: (row[10] && row[10].trim()) || null,
      };
    },
  },
  {
    name: 'Kids',
    range: 'A:F',
    table: 'kids_accounts',
    transform: (row) => {
      const date = row[3] ? new Date(row[3]) : null;
      if (!date || isNaN(date.getTime())) return null;
      return {
        child_name: row[0] || '',
        account_type: row[1] || '',
        balance_usd: parseFloat(row[2] || '0'),
        date_updated: date,
        notes: (row[4] && row[4].trim()) || null,
        purpose: (row[5] && row[5].trim()) || null,
      };
    },
  },
  {
    name: 'Debt',
    range: 'A:F',
    table: 'debt',
    transform: (row) => {
      // Skip rows missing essential fields (name and at least one amount)
      if (!row[1] || (!row[3] && !row[4])) return null;
      const date = row[5] ? new Date(row[5]) : null;
      if (!date || isNaN(date.getTime())) return null;
      return {
        type: row[0] || '',
        name: row[1] || '',
        purpose: (row[2] && row[2].trim()) || null,
        amount_gbp: row[3] ? parseFloat(row[3]) : null,
        amount_usd: row[4] ? parseFloat(row[4]) : null,
        date_updated: date,
      };
    },
  },
  {
    name: 'Transaction Log',
    range: 'A:F',
    table: 'transaction_log',
    transform: (row) => {
      const date = row[0] ? new Date(row[0]) : null;
      if (!date || isNaN(date.getTime())) return null;
      const counterparty = row[2] || null;
      // Column F may be missing in sparse rows; accept any value that starts with USD/GBP (case-insensitive)
      const raw = row.length > 5 && row[5] != null ? String(row[5]).trim() : '';
      const u = raw.toUpperCase();
      const currency = u.startsWith('USD') ? 'USD' : u.startsWith('GBP') ? 'GBP' : null;
      return {
        date,
        category: row[1] || '',
        counterparty,
        counterparty_dedup: (counterparty ?? '').toString(),
        amount_usd: row[3] ? parseFloat(row[3]) : null,
        amount_gbp: row[4] ? parseFloat(row[4]) : null,
        currency: currency || null,
      };
    },
  },
  {
    name: 'Budget Targets',
    range: 'A:H',
    table: 'budget_targets',
    transform: (row) => ({
      category: row[0] || '',
      // Column B: Annual Budget GBP (assuming this is still in column B)
      annual_budget_gbp: parseFloat(row[1] || '0'),
      // Column C: Tracking GBP (Est)
      tracking_est_gbp: parseFloat(row[2] || '0'),
      // Column D: YTD GBP
      ytd_gbp: parseFloat(row[3] || '0'),
      // Column E: Annual Budget USD (assuming this is in column E, or could be in another column)
      annual_budget_usd: parseFloat(row[4] || row[5] || '0'),
      // Column G: Tracking USD (Est) - skip column F (index 5)
      tracking_est_usd: parseFloat(row[6] || '0'),
      // Column H: YTD USD
      ytd_usd: parseFloat(row[7] || '0'),
    }),
  },
  {
    name: 'Historical Net Worth',
    range: 'A:D',
    table: 'historical_net_worth',
    transform: (row) => {
      const date = row[0] ? new Date(row[0]) : null;
      if (!date || isNaN(date.getTime())) return null;
      return {
        date,
        category: row[1] || '',
        amount_usd: row[2] ? parseFloat(row[2]) : null,
        amount_gbp: row[3] ? parseFloat(row[3]) : null,
      };
    },
  },
  {
    name: 'FX Rates',
    range: 'A:C',
    table: 'fx_rates',
    transform: (row) => {
      // Normalize date to ISO string format (YYYY-MM-DD) for consistent comparison
      const dateValue = row[0] ? new Date(row[0]) : null;
      if (!dateValue || isNaN(dateValue.getTime())) return null;
      const dateStr = dateValue.toISOString().split('T')[0];
      return {
        date: dateStr,
        gbpusd_rate: parseFloat(row[1] || '0'),
        eurusd_rate: parseFloat(row[2] || '0'),
      };
    },
  },
  {
    name: 'FX Rate Current',
    range: 'A:B',
    table: 'fx_rate_current',
    transform: (row) => {
      const date = row[0] ? new Date(row[0]) : null;
      if (!date || isNaN(date.getTime())) return null;
      return {
        date,
        gbpusd_rate: parseFloat(row[1] || '0'),
      };
    },
  },
  {
    name: 'Annual Trends',
    range: 'A:G',
    table: 'annual_trends',
    transform: (row) => ({
      category: row[0] || '',
      cur_yr_minus_4: parseFloat(row[1] || '0'),
      cur_yr_minus_3: parseFloat(row[2] || '0'),
      cur_yr_minus_2: parseFloat(row[3] || '0'),
      cur_yr_minus_1: parseFloat(row[4] || '0'),
      cur_yr_est: parseFloat(row[5] || '0'),
      cur_yr_est_vs_4yr_avg: parseFloat(row[6] || '0'),
    }),
  },
  {
    name: 'Monthly Trends',
    range: 'A:H',
    table: 'monthly_trends',
    transform: (row) => ({
      category: row[0] || '',
      cur_month_minus_3: parseFloat(row[1] || '0'),
      cur_month_minus_2: parseFloat(row[2] || '0'),
      cur_month_minus_1: parseFloat(row[3] || '0'),
      cur_month_est: parseFloat(row[4] || '0'),
      ttm_avg: parseFloat(row[5] || '0'),
      z_score: parseFloat(row[6] || '0'),
      delta_vs_l3m: parseFloat(row[7] || '0'),
    }),
  },
  {
    name: 'Investment Return',
    range: 'A:B',
    table: 'investment_return',
    transform: (row) => {
      const source = (row[0] ?? '').toString().trim()
      if (!source || source.toLowerCase() === 'income sources') return null
      const raw = (row[1] ?? '').toString().trim()
      let amount = 0
      if (raw) {
        const num = parseFloat(raw.replace(/[£$,\s]/g, ''))
        if (!isNaN(num)) {
          if (raw.toUpperCase().endsWith('K')) amount = num * 1000
          else if (raw.toUpperCase().endsWith('M')) amount = num * 1e6
          else amount = num
        }
      }
      return {
        income_source: source,
        amount_gbp: amount,
      }
    },
  },
  {
    name: 'YoY Net Worth',
    range: 'A:C',
    table: 'yoy_net_worth',
    transform: (row) => ({
      category: row[0] || '',
      amount_usd: row[1] ? parseFloat(row[1]) : null,
      amount_gbp: row[2] ? parseFloat(row[2]) : null,
    }),
  },
  {
    name: 'Recurring Payments',
    range: 'A:I', // Read columns A through I to get Name (B), Annual (E), and CCY (H)
    table: 'recurring_payments',
    transform: (row) => {
      // Column structure:
      // A: % of Total
      // B: Name
      // C: Category
      // D: Monthly
      // E: Annual (annualized amount)
      // F: Periodicity
      // G: Date
      // H: CCY (currency)
      // I: Notes

      const colB = (row[1] || '').toString().trim() // Name
      const colE = (row[4] || '').toString().trim() // Annual amount
      const colH = (row[7] || '').toString().trim().toUpperCase() // Currency (CCY)

      // Skip empty rows or header rows
      if (!colB || colB.toLowerCase() === 'name' || colB.toLowerCase().includes('annualized')) {
        return null
      }

      // Parse the annual amount (remove commas, currency symbols, etc.)
      const amount = colE ? parseFloat(colE.replace(/[£$,\s]/g, '')) : null

      if (!amount || isNaN(amount)) {
        return null // Skip rows without valid amounts
      }

      // Store amount in the appropriate currency column based on CCY
      let amountGbp: number | null = null
      let amountUsd: number | null = null

      if (colH === 'GBP' || !colH) {
        // Default to GBP if no currency specified
        amountGbp = amount
        amountUsd = null
      } else if (colH === 'USD') {
        amountGbp = null
        amountUsd = amount
      } else {
        // Unknown currency, default to GBP
        amountGbp = amount
        amountUsd = null
      }

      return {
        name: colB,
        annualized_amount_gbp: amountGbp,
        annualized_amount_usd: amountUsd,
      }
    },
  },
];

export interface SyncGoogleSheetOptions {
  spreadsheetId: string;
  userId: string;
}

/**
 * Sync Google Sheet data into Supabase.
 * @param supabase - Optional client. When provided (e.g. cron with admin), uses it and bypasses RLS.
 * When omitted (e.g. manual refresh), uses server client with authenticated user session.
 * @param options - spreadsheetId and userId; every row (except FX tables) is written with this user_id.
 */
export async function syncGoogleSheet(
  supabase: SupabaseClient | undefined,
  options: SyncGoogleSheetOptions
) {
  const { spreadsheetId, userId } = options;
  try {
    if (!spreadsheetId) {
      throw new Error('spreadsheetId is required')
    }
    if (!userId) {
      throw new Error('userId is required')
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL environment variable is not set')
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY environment variable is not set')
    }

    // Initialize Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const db = supabase ?? (await createClient());

    // First, get the list of sheets to verify they exist
    let availableSheets: string[] = [];
    try {
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
      });
      availableSheets = (spreadsheetInfo.data.sheets || []).map(sheet => sheet.properties?.title || '');
      console.log('Available sheets in spreadsheet:', availableSheets);
    } catch (error: any) {
      console.error('Error fetching spreadsheet info:', error);
      throw new Error(`Failed to access spreadsheet: ${error.message}`);
    }

    // Filter to only configs whose sheet tab exists in the spreadsheet
    const presentConfigs: SheetConfig[] = [];
    const missingConfigs: SheetConfig[] = [];
    for (const config of SHEET_CONFIGS) {
      if (availableSheets.includes(config.name)) {
        presentConfigs.push(config);
      } else {
        missingConfigs.push(config);
        console.warn(`Sheet "${config.name}" not found in spreadsheet – skipping.`);
      }
    }

    // Build ranges for a single batchGet call (one API round-trip instead of N)
    const ranges = presentConfigs.map((config) => {
      const quotedSheetName = config.name.includes(' ') ? `'${config.name}'` : config.name;
      return `${quotedSheetName}!${config.range}`;
    });

    // Fetch ALL sheet data in one batchGet call
    console.log(`Fetching ${ranges.length} sheets in a single batchGet call...`);
    type FetchedItem = { config: SheetConfig; error: string | null; data: any[] | null };
    const fetchedData: FetchedItem[] = [];

    try {
      const batchResponse = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
      });

      const valueRanges = batchResponse.data.valueRanges || [];

      for (let i = 0; i < presentConfigs.length; i++) {
        const config = presentConfigs[i];
        const rows = valueRanges[i]?.values;

        if (!rows || rows.length < 2) {
          fetchedData.push({ config, error: null, data: null });
          continue;
        }

        const dataRows = rows.slice(1);
        const transformedData = dataRows
          .map((row) => config.transform?.(row))
          .filter((row) => row && Object.values(row).some((v) => v !== null && v !== ''));

        if (transformedData.length === 0) {
          fetchedData.push({ config, error: null, data: null });
        } else {
          fetchedData.push({ config, error: null, data: transformedData });
        }
      }
    } catch (error: any) {
      console.error('batchGet failed, falling back to individual fetches:', error.message);
      // Fallback: fetch individually in parallel
      const fallbackResults = await Promise.all(
        presentConfigs.map(async (config) => {
          try {
            const quotedSheetName = config.name.includes(' ') ? `'${config.name}'` : config.name;
            const rangeString = `${quotedSheetName}!${config.range}`;
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: rangeString,
            });
            const rows = response.data.values;
            if (!rows || rows.length < 2) {
              return { config, error: null, data: null } as FetchedItem;
            }
            const dataRows = rows.slice(1);
            const transformedData = dataRows
              .map((row) => config.transform?.(row))
              .filter((row) => row && Object.values(row).some((v) => v !== null && v !== ''));
            return {
              config,
              error: null,
              data: transformedData.length === 0 ? null : transformedData,
            } as FetchedItem;
          } catch (err: any) {
            return { config, error: err.message || 'Unknown error', data: null } as FetchedItem;
          }
        })
      );
      fetchedData.push(...fallbackResults);
    }

    // Add missing sheets as no-data items
    for (const config of missingConfigs) {
      fetchedData.push({ config, error: null, data: null });
    }

    console.log(`Fetched ${fetchedData.length} sheets`);

    const results: { sheet: string; success: boolean; error?: string; rowsProcessed: number }[] = [];

    const processOneSheet = async (
      item: FetchedItem,
      uid: string
    ): Promise<{ sheet: string; success: boolean; error?: string; rowsProcessed: number }> => {
      const { config, error: itemError, data } = item;
      if (itemError) {
        return { sheet: config.name, success: false, error: itemError, rowsProcessed: 0 };
      }
      if (!data) {
        console.warn(`No data found for sheet: ${config.name}`);
        return { sheet: config.name, success: true, rowsProcessed: 0 };
      }
      const transformedData = data;
      const dataWithUser = isGlobalTable(config.table)
        ? transformedData
        : transformedData.map((row: any) => ({ ...row, user_id: uid }));

      try {
        let upsertResult: { data: any; error: any };
        if (config.table === 'account_balances') {
          // Build set of current institution per account_name|category to clean up stale rows
          const uniqueAccounts = new Map<string, { account_name: string; category: string; institution: string }>();
          for (const record of transformedData) {
            const key = `${record.account_name}|${record.category}`;
            if (!uniqueAccounts.has(key)) {
              uniqueAccounts.set(key, {
                account_name: record.account_name,
                category: record.category,
                institution: record.institution,
              });
            }
          }
          // Delete stale rows in parallel (all at once, no nested chunking)
          const accountList = Array.from(uniqueAccounts.values());
          await Promise.all(
            accountList.map(async (accountInfo) => {
              const { error: deleteError } = await db
                .from(config.table)
                .delete()
                .eq('user_id', uid)
                .eq('account_name', accountInfo.account_name)
                .eq('category', accountInfo.category)
                .neq('institution', accountInfo.institution);
              if (deleteError) {
                console.warn(`Warning: Could not delete old account_balances for ${accountInfo.account_name} (${accountInfo.category}):`, deleteError);
              }
            })
          );
          const { data: d, error: e } = await db
            .from(config.table)
            .upsert(dataWithUser, { onConflict: 'user_id,institution,account_name,date_updated' });
          upsertResult = { data: d, error: e };
        } else if (config.table === 'kids_accounts') {
          const normalizedData = dataWithUser.map((record: any) => ({
            ...record,
            notes: (record.notes && record.notes.trim()) || null,
            purpose: (record.purpose && record.purpose.trim()) || null,
          }));
          console.log(`Kids Accounts: Processing ${normalizedData.length} rows`);
          const { data, error } = await db
            .from(config.table)
            .upsert(normalizedData, {
              onConflict: 'user_id,child_name,account_type,date_updated,notes',
            });
          upsertResult = { data, error };
        } else if (DELETE_INSERT_TABLES.has(config.table)) {
          // Generic delete-then-insert for all tables using this pattern
          if (config.table === 'recurring_payments') {
            // Preserve needs_review flags from existing records before deleting
            const { data: existingRecords } = await db
              .from(config.table)
              .select('name, needs_review')
              .eq('user_id', uid);
            const reviewFlags = new Map<string, boolean>();
            if (existingRecords) {
              existingRecords.forEach((record: any) => {
                reviewFlags.set((record.name || '').toLowerCase().trim(), !!record.needs_review);
              });
            }

            // Delete existing rows
            await db.from(config.table).delete().eq('user_id', uid);

            // Apply preserved needs_review flags and deduplicate by name (aggregate amounts)
            const withFlags = dataWithUser.map((item: any) => ({
              ...item,
              needs_review: reviewFlags.get((item.name || '').toLowerCase().trim()) ?? false,
              updated_at: new Date().toISOString(),
            }));

            const byName = new Map<
              string,
              { name: string; annualized_amount_gbp: number | null; annualized_amount_usd: number | null; needs_review: boolean; updated_at: string }
            >();
            for (const item of withFlags) {
              const name = (item.name || '').trim();
              if (!name) continue;
              const existing = byName.get(name);
              if (!existing) {
                byName.set(name, {
                  name,
                  annualized_amount_gbp: item.annualized_amount_gbp ?? null,
                  annualized_amount_usd: item.annualized_amount_usd ?? null,
                  needs_review: item.needs_review,
                  updated_at: item.updated_at,
                });
              } else {
                const gbp = (existing.annualized_amount_gbp ?? 0) + (item.annualized_amount_gbp ?? 0);
                const usd = (existing.annualized_amount_usd ?? 0) + (item.annualized_amount_usd ?? 0);
                existing.annualized_amount_gbp = gbp || null;
                existing.annualized_amount_usd = usd || null;
              }
            }

            const mergedData = Array.from(byName.values()).map((row) => ({ ...row, user_id: uid }));
            const { data, error } = await db.from(config.table).insert(mergedData);
            upsertResult = { data, error };
          } else {
            // Simple delete-then-insert (debt, budget_targets, annual_trends, etc.)
            const { error: deleteError } = await db
              .from(config.table)
              .delete()
              .eq('user_id', uid);
            if (deleteError) {
              console.warn(`Warning: Could not delete old ${config.name} for user ${uid}:`, deleteError);
            }
            const { data, error } = await db.from(config.table).insert(dataWithUser);
            upsertResult = { data, error };
          }
        } else if (config.table === 'fx_rate_current') {
          // Skip rows with invalid gbpusd_rate (NaN, null, or non-positive) to avoid NOT NULL constraint violation
          const validData = transformedData.filter((row: any) => {
            const rate = row.gbpusd_rate
            return typeof rate === 'number' && Number.isFinite(rate) && rate > 0
          })
          if (validData.length < transformedData.length) {
            console.warn(`FX Rate Current: Skipped ${transformedData.length - validData.length} row(s) with invalid gbpusd_rate`)
          }
          if (validData.length === 0) {
            console.warn('FX Rate Current: No valid rows to upsert (all gbpusd_rate values invalid or missing)')
            upsertResult = { data: null, error: null }
          } else {
            const { data, error } = await db
              .from(config.table)
              .upsert(validData, {
                onConflict: 'date',
              })
            upsertResult = { data, error }
          }
        } else if (config.table === 'fx_rates') {
          // For historical FX rates, date is PRIMARY KEY
          // Deduplicate by date, keeping the last occurrence (in case of duplicates in source data)
          const dateMap = new Map<string, any>();

          transformedData.forEach((item: any) => {
            dateMap.set(item.date, item);
          });

          const deduplicatedData = Array.from(dateMap.values());
          console.log(`FX Rates: Processing ${transformedData.length} rows, ${deduplicatedData.length} unique dates`);
          if (transformedData.length !== deduplicatedData.length) {
            console.warn(`FX Rates: Found ${transformedData.length - deduplicatedData.length} duplicate dates in source data`);
          }
          const fxChunks = chunkArray(deduplicatedData, BATCH_SIZE);
          let fxLastError: any = null;
          for (const chunk of fxChunks) {
            const { error } = await db
              .from(config.table)
              .upsert(chunk, { onConflict: 'date' });
            if (error) fxLastError = error;
          }
          upsertResult = { data: null, error: fxLastError };
        } else if (config.table === 'historical_net_worth') {
          const { data, error } = await db
            .from(config.table)
            .upsert(dataWithUser, {
              onConflict: 'user_id,date,category',
            });
          upsertResult = { data, error };
        } else if (config.table === 'transaction_log') {
          // Single delete for all user rows, then chunked insert
          const { error: delErr } = await db
            .from(config.table)
            .delete()
            .eq('user_id', uid);
          if (delErr) {
            console.warn('Transaction Log: delete error', delErr);
          }

          const chunks = chunkArray(dataWithUser, BATCH_SIZE);
          let lastError: any = null;
          for (const chunk of chunks) {
            const { error } = await db.from(config.table).insert(chunk);
            if (error) lastError = error;
          }
          upsertResult = { data: null, error: lastError };
        } else {
          const { data, error } = await db
            .from(config.table)
            .insert(dataWithUser);
          upsertResult = { data, error };
        }

        if (upsertResult.error) {
          console.error(`Error upserting ${config.name}:`, upsertResult.error);
          console.error(`Full error details:`, JSON.stringify(upsertResult.error, null, 2));
          console.error(`Data being upserted (first 3 rows):`, transformedData.slice(0, 3));
          return {
            sheet: config.name,
            success: false,
            error: upsertResult.error.message || JSON.stringify(upsertResult.error),
            rowsProcessed: transformedData.length,
          };
        }
        return {
          sheet: config.name,
          success: true,
          rowsProcessed: transformedData.length,
        };
      } catch (error: any) {
        console.error(`Error processing sheet ${config.name}:`, error);
        let errorMessage = error.message || 'Unknown error';
        if (error.message?.includes('Unable to parse range')) {
          errorMessage = `Unable to parse range for sheet "${config.name}". Check that the sheet name matches exactly and the range "${config.range}" is valid.`;
        } else if (error.message?.includes('400')) {
          errorMessage = `Invalid request for sheet "${config.name}". Check sheet name and range format.`;
        }
        return {
          sheet: config.name,
          success: false,
          error: errorMessage,
          rowsProcessed: 0,
        };
      }
    };

    // Separate items by processing strategy
    const withData = fetchedData.filter((item) => item.data);
    const noDataItems = fetchedData.filter((item) => !item.data && !item.error);
    const errorItems = fetchedData.filter((item) => item.error);

    // Process ALL sheets with data in parallel (no more light/heavy distinction —
    // heavy tables are internally sequential with chunked inserts, safe to start concurrently)
    const dataResults = await Promise.all(withData.map((item) => processOneSheet(item, userId)));
    results.push(...dataResults);

    // Clear stale data for delete-then-insert tables whose sheet was empty, in parallel
    const noDataCleanups = noDataItems.map(async (item) => {
      if (DELETE_INSERT_TABLES.has(item.config.table) && !isGlobalTable(item.config.table)) {
        const { error: deleteError } = await db
          .from(item.config.table)
          .delete()
          .eq('user_id', userId);
        if (deleteError) {
          console.warn(`Warning: Could not clear empty-tab data for ${item.config.name}:`, deleteError);
        } else {
          console.log(`Cleared existing ${item.config.name} data (sheet tab was empty)`);
        }
      }
      return {
        sheet: item.config.name,
        success: true,
        rowsProcessed: 0,
      };
    });
    results.push(...(await Promise.all(noDataCleanups)));

    for (const item of errorItems) {
      results.push({
        sheet: item.config.name,
        success: false,
        error: item.error ?? undefined,
        rowsProcessed: 0,
      });
    }

    return {
      success: results.every((r) => r.success),
      results,
    };
  } catch (error: any) {
    console.error('Error syncing Google Sheet:', error);

    // Provide more specific error messages
    let errorMessage = error.message || 'Unknown error occurred';

    if (error.message?.includes('credentials')) {
      errorMessage = 'Google Sheets authentication failed. Check service account credentials.';
    } else if (error.message?.includes('spreadsheet')) {
      errorMessage = 'Could not access Google Sheet. Check spreadsheet ID and permissions.';
    } else if (error.message?.includes('permission') || error.message?.includes('403')) {
      errorMessage = 'Permission denied. Ensure service account has access to the spreadsheet.';
    }

    return {
      success: false,
      error: errorMessage,
      results: [],
    };
  }
}
