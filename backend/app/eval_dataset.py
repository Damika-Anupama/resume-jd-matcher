"""Labeled evaluation dataset for the resume <-> JD matching core.

Each :class:`LabeledPair` is a realistic resume / job-description pair annotated
by hand with the **gold** canonical skills a careful human reader would extract
from each side, plus the expected fit band. These human labels are what make the
eval honest: the harness measures the deterministic extractor against them
(precision / recall / F1) rather than against itself.

Gold skills use the canonical names from ``app.matching.SKILL_ALIASES``. Only
skills the engine is *capable* of recognising are labeled, so recall measures
real extraction quality (alias coverage, boundary handling) rather than
penalising the engine for skills deliberately outside its dictionary.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class LabeledPair:
    name: str
    resume: str
    jd: str
    gold_resume_skills: set[str]
    gold_jd_skills: set[str]
    # Expected fit band: "strong" (>=80), "partial" (50-79), "weak" (<50).
    expect_band: str
    notes: str = ""
    tags: list[str] = field(default_factory=list)


DATASET: list[LabeledPair] = [
    LabeledPair(
        name="frontend_strong",
        resume=(
            "Frontend engineer with 4 years building React and Next.js apps in "
            "TypeScript. Strong with REST APIs, Tailwind CSS, and Jest testing. "
            "Shipped a design system used across 12 product teams."
        ),
        jd=(
            "We are hiring a frontend engineer. Required: React, Next.js, "
            "TypeScript, REST APIs, and strong CSS. Testing experience a plus."
        ),
        gold_resume_skills={"react", "next.js", "typescript", "rest apis",
                            "tailwind", "html/css", "testing"},
        gold_jd_skills={"react", "next.js", "typescript", "rest apis",
                        "html/css", "testing"},
        expect_band="strong",
        tags=["frontend"],
    ),
    LabeledPair(
        name="backend_partial",
        resume=(
            "Backend developer. Built Python and FastAPI services backed by "
            "PostgreSQL. Containerised everything with Docker. Comfortable with "
            "Git-based workflows."
        ),
        jd=(
            "Backend role requiring Python, FastAPI, PostgreSQL, Kubernetes, "
            "Terraform, and observability (Prometheus/Grafana)."
        ),
        gold_resume_skills={"python", "fastapi", "postgresql", "docker", "git"},
        gold_jd_skills={"python", "fastapi", "postgresql", "kubernetes",
                        "terraform", "observability", "prometheus", "grafana"},
        expect_band="weak",
        notes="3/8 JD skills present (37.5%) -> genuinely weak; covers "
              "language/framework/db but misses the entire ops stack.",
        tags=["backend", "devops"],
    ),
    LabeledPair(
        name="devops_weak",
        resume=(
            "Frontend developer focused on React, HTML and CSS. Some experience "
            "with JavaScript animations."
        ),
        jd=(
            "Platform/DevOps engineer: AWS, Kubernetes, Terraform, CI/CD, and "
            "Prometheus monitoring are required day one."
        ),
        gold_resume_skills={"react", "html/css", "javascript"},
        gold_jd_skills={"aws", "kubernetes", "terraform", "ci/cd",
                        "prometheus", "observability"},
        expect_band="weak",
        tags=["devops"],
    ),
    LabeledPair(
        name="ml_engineer_strong",
        resume=(
            "Machine learning engineer. Built NLP pipelines in Python with "
            "PyTorch and scikit-learn. Served models via FastAPI. Data wrangling "
            "with pandas and numpy. Trained on Spark clusters."
        ),
        jd=(
            "ML engineer: Python, PyTorch, scikit-learn, NLP, and pandas. "
            "Model serving with FastAPI. Spark experience welcome."
        ),
        gold_resume_skills={"machine learning", "nlp", "python", "pytorch",
                            "scikit-learn", "fastapi", "pandas", "spark"},
        gold_jd_skills={"python", "pytorch", "scikit-learn", "nlp", "pandas",
                        "fastapi", "spark", "machine learning"},
        expect_band="strong",
        tags=["ml"],
    ),
    LabeledPair(
        name="fullstack_partial",
        resume=(
            "Full-stack developer. Node.js and Express on the backend, React on "
            "the front. MongoDB for storage. Deployed on AWS with Docker."
        ),
        jd=(
            "Full-stack engineer: Node.js, React, TypeScript, GraphQL, "
            "PostgreSQL, and AWS. Docker for local dev."
        ),
        gold_resume_skills={"node.js", "react", "mongodb", "aws", "docker"},
        gold_jd_skills={"node.js", "react", "typescript", "graphql",
                        "postgresql", "aws", "docker"},
        expect_band="partial",
        tags=["fullstack"],
    ),
    LabeledPair(
        name="java_backend_partial",
        resume=(
            "Java backend engineer using Spring Boot and MySQL. Built REST APIs "
            "and ran services on Kubernetes. Familiar with Kafka event streams."
        ),
        jd=(
            "Senior Java engineer: Java, Spring, REST APIs, PostgreSQL, "
            "Kubernetes, and Kafka. Microservices architecture."
        ),
        gold_resume_skills={"java", "spring", "mysql", "rest apis",
                            "kubernetes", "kafka"},
        gold_jd_skills={"java", "spring", "rest apis", "postgresql",
                        "kubernetes", "kafka", "microservices"},
        expect_band="partial",
        notes="5/7 JD skills present (71%) -> partial.",
        tags=["backend", "java"],
    ),
    LabeledPair(
        name="data_engineer_strong",
        resume=(
            "Data engineer. Built ETL pipelines with Airflow and Spark. Python "
            "and SQL daily. Loaded into PostgreSQL and Elasticsearch. CI/CD with "
            "GitHub Actions."
        ),
        jd=(
            "Data engineer: Python, SQL, data pipelines, Airflow, Spark, and a "
            "warehouse (PostgreSQL). CI/CD a plus."
        ),
        gold_resume_skills={"data engineering", "airflow", "spark", "python",
                            "sql", "postgresql", "elasticsearch", "ci/cd", "git"},
        gold_jd_skills={"python", "sql", "data engineering", "airflow",
                        "spark", "postgresql", "ci/cd"},
        expect_band="strong",
        tags=["data"],
    ),
    LabeledPair(
        name="career_changer_weak",
        resume=(
            "Recent bootcamp graduate. Built a few small projects in HTML, CSS "
            "and JavaScript. Eager to learn and grow."
        ),
        jd=(
            "Senior platform engineer: Go, Kubernetes, Terraform, AWS, and "
            "distributed systems. 6+ years required."
        ),
        gold_resume_skills={"html/css", "javascript"},
        gold_jd_skills={"go", "kubernetes", "terraform", "aws", "microservices"},
        expect_band="weak",
        tags=["junior"],
    ),
    LabeledPair(
        name="cloud_partial",
        resume=(
            "Cloud engineer on Azure. Terraform for IaC, Docker containers, and "
            "serverless functions. Some Python scripting."
        ),
        jd=(
            "Cloud engineer: AWS, Terraform, Docker, Kubernetes, serverless, and "
            "Python. Azure also fine."
        ),
        gold_resume_skills={"azure", "terraform", "docker", "serverless",
                            "python"},
        gold_jd_skills={"aws", "terraform", "docker", "kubernetes",
                        "serverless", "python", "azure"},
        expect_band="partial",
        tags=["cloud"],
    ),
    LabeledPair(
        name="exact_match_strong",
        resume=(
            "Built RAG pipelines with OpenAI and FastAPI, plus Playwright "
            "end-to-end tests. Strong Python."
        ),
        jd="LLM integration, FastAPI backend, Playwright e2e tests, and Python.",
        gold_resume_skills={"llm", "fastapi", "playwright", "python"},
        gold_jd_skills={"llm", "fastapi", "playwright", "python"},
        expect_band="strong",
        tags=["llm"],
    ),
    LabeledPair(
        name="vue_frontend_partial",
        resume=(
            "Frontend dev with Vue.js and Tailwind. TypeScript daily. Some "
            "GraphQL on the side."
        ),
        jd=(
            "Frontend engineer: React, TypeScript, Tailwind, and GraphQL. Vue "
            "experience transferable."
        ),
        gold_resume_skills={"vue", "tailwind", "typescript", "graphql"},
        gold_jd_skills={"react", "typescript", "tailwind", "graphql", "vue"},
        expect_band="strong",
        notes="3 of 5 JD skills present -> 60%, partial/strong boundary check.",
        tags=["frontend"],
    ),
    LabeledPair(
        name="dotnet_weak",
        resume=(
            "Enterprise developer in C# and .NET with SQL Server. Building "
            "ASP.NET web apps for a decade."
        ),
        jd=(
            "Python/Django backend engineer with PostgreSQL, Redis, and Celery "
            "task queues."
        ),
        gold_resume_skills={"c#", "sql"},
        gold_jd_skills={"python", "django", "postgresql", "redis", "celery"},
        expect_band="weak",
        tags=["backend"],
    ),
    LabeledPair(
        name="sre_partial",
        resume=(
            "Site reliability engineer. Prometheus and Grafana for monitoring, "
            "Kubernetes in production, Terraform for infra. Python and Go "
            "tooling."
        ),
        jd=(
            "SRE: Kubernetes, Terraform, Prometheus, observability, AWS, and "
            "incident response. Golang preferred."
        ),
        gold_resume_skills={"prometheus", "grafana", "observability",
                            "kubernetes", "terraform", "python"},
        gold_jd_skills={"kubernetes", "terraform", "prometheus",
                        "observability", "aws", "go"},
        expect_band="partial",
        notes="4/6 JD skills present (67%) -> partial. Known limitation: bare "
              "'Go' in the resume is not extracted (the 2-letter token would "
              "false-positive on the English verb), so 'golang' is the reliable "
              "alias; the JD here uses 'Golang'.",
        tags=["sre", "devops"],
    ),
    LabeledPair(
        name="mobile_no_overlap_weak",
        resume=(
            "Mobile engineer. Years of Swift and Kotlin building iOS and Android "
            "apps."
        ),
        jd=(
            "Backend engineer: Python, FastAPI, PostgreSQL, Docker, and "
            "Kubernetes."
        ),
        gold_resume_skills=set(),  # none in our dictionary -> recall N/A
        gold_jd_skills={"python", "fastapi", "postgresql", "docker",
                        "kubernetes"},
        expect_band="weak",
        notes="Out-of-dictionary resume; tests that unknown skills score 0.",
        tags=["mobile"],
    ),
    LabeledPair(
        name="php_to_node_weak",
        resume="PHP and Laravel developer with MySQL. Some jQuery.",
        jd="Node.js and Express backend with MongoDB and GraphQL.",
        gold_resume_skills={"php", "mysql"},
        gold_jd_skills={"node.js", "mongodb", "graphql"},
        expect_band="weak",
        tags=["backend"],
    ),
    LabeledPair(
        name="ruby_partial",
        resume=(
            "Ruby on Rails engineer. PostgreSQL, Redis caching, and Sidekiq "
            "background jobs. Docker for local dev."
        ),
        jd=(
            "Ruby on Rails developer: Ruby, PostgreSQL, Redis, and Docker. "
            "AWS deployment."
        ),
        gold_resume_skills={"ruby", "postgresql", "redis", "docker"},
        gold_jd_skills={"ruby", "postgresql", "redis", "docker", "aws"},
        expect_band="strong",
        tags=["backend", "ruby"],
    ),
    LabeledPair(
        name="security_no_jd_skills",
        resume="Python developer with FastAPI and Docker.",
        jd=(
            "We value curiosity, ownership, and clear communication. Join a "
            "kind, collaborative team."
        ),
        gold_resume_skills={"python", "fastapi", "docker"},
        gold_jd_skills=set(),
        expect_band="weak",
        notes="JD lists no recognisable hard skills -> neutral 0 score.",
        tags=["edge"],
    ),
    LabeledPair(
        name="angular_enterprise_partial",
        resume=(
            "Angular and TypeScript frontend. RxJS state management. SCSS "
            "styling. Karma/Jasmine unit tests."
        ),
        jd=(
            "Frontend engineer: Angular, TypeScript, CSS, and unit testing. "
            "REST API integration."
        ),
        gold_resume_skills={"angular", "typescript", "html/css", "testing"},
        gold_jd_skills={"angular", "typescript", "html/css", "testing",
                        "rest apis"},
        expect_band="strong",
        tags=["frontend"],
    ),
    LabeledPair(
        name="go_microservices_strong",
        resume=(
            "Backend engineer writing Go microservices. gRPC and Kafka for "
            "messaging. Kubernetes deploys. PostgreSQL and Redis."
        ),
        jd=(
            "Golang engineer: Go, microservices, Kafka, Kubernetes, "
            "PostgreSQL, and Redis."
        ),
        gold_resume_skills={"go", "microservices", "kafka", "kubernetes",
                            "postgresql", "redis"},
        gold_jd_skills={"go", "microservices", "kafka", "kubernetes",
                        "postgresql", "redis"},
        expect_band="strong",
        tags=["backend", "go"],
    ),
    LabeledPair(
        name="junior_python_partial",
        resume=(
            "Junior developer. Python scripting, basic SQL, and Git. Built a "
            "small Flask app and used Pandas for analysis."
        ),
        jd=(
            "Junior backend: Python, SQL, Git, and a web framework. Data work "
            "with pandas a plus."
        ),
        gold_resume_skills={"python", "sql", "git", "pandas"},
        gold_jd_skills={"python", "sql", "git", "pandas"},
        expect_band="strong",
        tags=["junior"],
    ),
]
