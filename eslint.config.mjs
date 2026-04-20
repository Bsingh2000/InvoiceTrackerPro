import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"],
    rules: {
      "react-hooks/incompatible-library": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default eslintConfig;
