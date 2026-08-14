import type { Config } from "tailwindcss"
import tailwindcssAnimate from "tailwindcss-animate"
import typography from "@tailwindcss/typography"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Two seam weights. `border-border` joins things that belong together,
        // `border-border-strong` separates things that do not.
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // Three surface planes. Depth is tonal first and shadowed second, so
        // cards still read as separate planes on a dark ground.
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        raised: "hsl(var(--raised))",
        sunken: "hsl(var(--sunken))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          tint: "hsl(var(--primary-tint) / 0.12)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Variance, and only variance. A figure that is merely large does not
        // get to be coloured — reach for the neutral scale instead.
        positive: {
          DEFAULT: "hsl(var(--positive))",
          tint: "hsl(var(--positive) / 0.12)",
        },
        negative: {
          DEFAULT: "hsl(var(--negative))",
          tint: "hsl(var(--negative) / 0.12)",
        },
        // Ordered series ramp for charts, kept clear of the variance pair so a
        // series colour never reads as a status.
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
          grid: "hsl(var(--chart-grid))",
          axis: "hsl(var(--chart-axis))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans, system-ui)", "system-ui", "sans-serif"],
        // Editorial voice: page titles and the hero figure only.
        serif: ["var(--font-serif, Georgia)", "Georgia", "serif"],
        // Working figures: KPI values, table numerals, anything scanned in a column.
        num: ["var(--font-num, ui-sans-serif)", "var(--font-sans, system-ui)", "sans-serif"],
      },
      fontSize: {
        display: ["var(--text-display)", { lineHeight: "var(--leading-display)", letterSpacing: "-0.02em" }],
        heading: ["var(--text-heading)", { lineHeight: "var(--leading-heading)", letterSpacing: "-0.015em" }],
        figure: ["var(--text-figure)", { lineHeight: "var(--leading-figure)", letterSpacing: "-0.02em" }],
        title: ["var(--text-title)", { lineHeight: "var(--leading-title)", letterSpacing: "-0.01em" }],
        body: ["var(--text-body)", { lineHeight: "var(--leading-body)" }],
        meta: ["var(--text-meta)", { lineHeight: "var(--leading-meta)" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        card: "var(--shadow-card), var(--edge-highlight)",
        raised: "var(--shadow-raised), var(--edge-highlight)",
        overlay: "var(--shadow-overlay), var(--edge-highlight)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Content arriving after a query resolves, so a page does not snap.
        "rise-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "rise-in": "rise-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config

export default config
