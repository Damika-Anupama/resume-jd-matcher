/**
 * Synthetic sample pair for the one-click demo. Entirely fictional — persona,
 * companies, and numbers are invented; no real PII of any kind.
 *
 * Designed to demonstrate the scoring tiers: the resume covers every required
 * keyword (100% required coverage) while all three nice-to-have keywords are
 * visibly missing, so first-time visitors see both a strong score AND gaps.
 */

export const SAMPLE_RESUME = `Alex Morgan
Full-Stack Engineer — fictional sample profile

Summary
Product-minded full-stack engineer with six years of experience shipping web applications end to end.

Experience
Senior Full-Stack Engineer, Northwind Labs (fictional) — 2022 to present
- Built customer-facing dashboards in React and Next.js with TypeScript across the stack.
- Designed and versioned REST APIs in Node.js serving about 40,000 requests per day.
- Modelled billing and reporting data in PostgreSQL and added Redis caching for hot queries.
- Containerised every service with Docker and wrote Playwright end-to-end tests for release-critical flows.

Software Engineer, Contoso Digital (fictional) — 2019 to 2022
- Delivered internal tools with React, Tailwind, and a Node.js API layer.
- Kept the team's GitHub Actions pipelines green and fast.

Education
B.Sc. in Computer Science (fictional university)`;

export const SAMPLE_JD = `Senior Full-Stack Engineer — sample job description
Northwind Labs (fictional) is hiring a senior engineer to own features across the stack.

Requirements:
- 4+ years building production web apps with React and Next.js
- Strong TypeScript on both client and server
- Designing REST APIs with Node.js
- Solid PostgreSQL schema and query skills
- Ships services with Docker

Nice to have:
- Kubernetes in production
- Terraform for infrastructure
- GraphQL API design`;
