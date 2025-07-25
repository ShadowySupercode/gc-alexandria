import flowbite from "flowbite/plugin";
import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config}*/
const config = {
  content: [
    "./src/**/*.{html,js,svelte,ts}",
    "./node_modules/flowbite/**/*.js",
    "./node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}",
  ],

  theme: {
    extend: {
      colors: {
        highlight: "#f9f6f1",
        primary: {
          0: "#efe6dc",
          50: "#decdb9",
          100: "#d6c1a8",
          200: "#c6a885",
          300: "#b58f62",
          400: "#ad8351",
          500: "#c6a885",
          600: "#795c39",
          700: "#564a3e",
          800: "#3c352c",
          900: "#2a241c",
          950: "#1d1812",
          1000: "#15110d",
        },
        success: {
          50: "#e3f2e7",
          100: "#c7e6cf",
          200: "#a2d4ae",
          300: "#7dbf8e",
          400: "#5ea571",
          500: "#4e8e5f",
          600: "#3e744c",
          700: "#305b3b",
          800: "#22412a",
          900: "#15281b",
        },
        info: {
          50: "#e7eff6",
          100: "#c5d9ea",
          200: "#9fbfdb",
          300: "#7aa5cc",
          400: "#5e90be",
          500: "#4779a5",
          600: "#365d80",
          700: "#27445d",
          800: "#192b3a",
          900: "#0d161f",
        },
        warning: {
          50: "#fef4e6",
          100: "#fde4bf",
          200: "#fcd18e",
          300: "#fbbc5c",
          400: "#f9aa33",
          500: "#f7971b",
          600: "#c97a14",
          700: "#9a5c0e",
          800: "#6c3e08",
          900: "#3e2404",
        },
        danger: {
          50: "#fbeaea",
          100: "#f5cccc",
          200: "#eba5a5",
          300: "#e17e7e",
          400: "#d96060",
          500: "#c94848",
          600: "#a53939",
          700: "#7c2b2b",
          800: "#521c1c",
          900: "#2b0e0e",
        },
      },
      listStyleType: {
        "upper-alpha": "upper-alpha", // Uppercase letters
        "lower-alpha": "lower-alpha", // Lowercase letters
      },
      flexGrow: {
        1: "1",
        2: "2",
        3: "3",
      },
      hueRotate: {
        20: "20deg",
      },
    },
  },

  plugins: [
    flowbite(),
    plugin(function ({ addUtilities, matchUtilities }) {
      addUtilities({
        ".content-visibility-auto": {
          "content-visibility": "auto",
        },
        ".contain-size": {
          contain: "size",
        },
      });

      matchUtilities({
        "contain-intrinsic-w-*": (value) => ({
          width: value,
        }),
        "contain-intrinsic-h-*": (value) => ({
          height: value,
        }),
      });
    }),
  ],

  darkMode: "class",
};

module.exports = config;
