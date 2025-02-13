import flowbite from "flowbite/plugin";

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
        primary: {
          0: '#efe6dc',
          50: '#decdb9',
          100: '#d6c1a8',
          200: '#c6a885',
          300: '#b58f62',
          400: '#ad8351',
          500: '#9c7649',
          600: '#795c39',
          700: '#574229',
          800: '#342718',
          900: '#231a10',
          1000: '#110d08',
        },
      },
      listStyleType: {
        'upper-alpha': 'upper-alpha', // Uppercase letters
        'lower-alpha': 'lower-alpha', // Lowercase letters
      }
    },
  },

  plugins: [
    flowbite(),
  ],

  darkMode: 'class',
};

module.exports = config;
