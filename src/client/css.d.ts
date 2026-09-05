/**
 * Type declaration so importing a `*.module.css` file in TypeScript returns
 * the class map the tsdown CSS Modules plugin emits. Without it `import css
 * from './X.module.css'` is `any` and the typed JSX drops the keys.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}