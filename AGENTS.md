# Engineering Guidelines

Apply these guidelines to all generated code. Prioritize local reasoning and a bounded blast radius over cleverness or premature reuse.

## 1. Explicit Dependencies

Pass all outside-world dependencies—configuration, clients, credentials, clocks, and environment—as arguments. Avoid module-level globals, implicit `init()` ordering, and business logic that reaches into shared configuration. If a function needs a dependency, its signature must show it.

## 2. Types as Contracts

Do not use `any` or untyped dictionaries at module boundaries. Functions that can fail return a `Result` type rather than throwing exceptions. Model errors as discriminated unions with one named variant per failure mode. Write the signature before the implementation.

## 3. Tests as Specification

Write tests before implementation. Cover the happy path, boundary conditions, and every failure mode. Show the test list before writing implementation and wait for review. Never modify a test to fit a broken implementation. If a test is wrong, flag it explicitly.

## 4. Fail Fast, Fail Loud

Validate inputs at every public-function entry and raise specific named exceptions for invalid data. Do not silently fall back or use defaults that mask missing data. When catching an error, either re-raise it or convert it to a domain-specific error with structured context.

## 5. Vertical Slices, Strong Boundaries

Organize by feature rather than technical layer. Each feature has one folder containing its routes, logic, data access, types, and tests. Features do not import from other features. Do not introduce shared `utils`, `common`, or `helpers` folders; duplicate code instead. A feature change should touch one folder.

## 6. Rule of Three

Duplicate before abstracting. Extract a shared abstraction only after the same pattern appears in three distinct, real places. Two similar implementations are coincidence, not a pattern. Optimize for blast radius over DRY.

## Conflict Resolution

If a user request conflicts with these rules, flag the conflict explicitly before writing code. Do not silently violate a rule. Ask which takes priority.
