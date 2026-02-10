-- Drop deprecated trends tables (now computed from transactions)
DROP TABLE IF EXISTS annual_trends CASCADE;
DROP TABLE IF EXISTS monthly_trends CASCADE;

