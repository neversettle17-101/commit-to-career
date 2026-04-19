# PRD: Job Search Multi-Agent Workflow

**Version:** 0.1 (MVP)
**Status:** Draft
**Author:** Aditi Chauhan

---

## 1. Overview

Job hunting is repetitive and time-consuming — researching companies, tailoring resumes, finding the right people to contact, and writing personalised outreach messages all take significant effort. This platform automates that workflow through a multi-agent system that takes a company name as input and handles everything through to sending outreach emails.

---

## 2. Goals

- Reduce time spent on job application outreach from hours to minutes.
- Enable personalised, context-aware outreach at scale.
- Give the user visibility and control before anything is sent on their behalf.

**Out of scope for MVP:**
- Resume editing or generation.
- Application tracking / ATS integration.
- User authentication (stubbed with a static profile for now).

---

## 3. User Personas

**Primary:** A job seeker actively applying to multiple companies who is comfortable with basic web tools and wants to save time on cold outreach.

---

## 4. User Flow

### Step 1 — Profile Load

When the user opens the platform, their profile is loaded automatically. The profile contains:
- Resume (uploaded document or structured data)
- Work experience, education, and skills
- Preferred roles and job types
- Preferred tone for outreach (professional / casual / concise)

The user can view and edit their profile before starting a search. No action is required if it's already up to date.

---

### Step 2 — Company Input

The user types a company name into a search bar and submits.

Example input: `"Stripe"` or `"Anthropic"`

The platform begins the research pipeline automatically after submission.

---

### Step 3 — Company Research (Automated)

The platform's research agent gathers the following about the company:

- **Overview:** What the company does, size, stage, and industry.
- **LinkedIn presence:** Company page URL and key details.
- **Recent activity:** Blog posts, news, or product launches from the last 90 days (used to personalise outreach).
- **Open roles:** Job postings relevant to the user's profile, pulled from the company's careers page or job boards.

The user sees a summary card of what was found. They can dismiss irrelevant roles or add notes before proceeding.

---

### Step 4 — People Discovery (Automated)

The platform's people-finder agent identifies employees at the company who are relevant to contact. Priority targets include:

- Hiring managers for the matched roles.
- Recruiters or HR personnel.
- Team leads or senior ICs in the relevant department.

For each person found, the platform surfaces:
- Name and title
- LinkedIn profile URL
- Email address (found or inferred via standard patterns)

The user reviews the list. They can remove contacts they don't want to reach out to or add contacts manually.

---

### Step 5 — Message Drafting (Automated)

For each approved contact, the platform's drafting agent generates a personalised outreach email. Each draft is tailored using:

- The contact's name, title, and team.
- The specific job description of the relevant role.
- Highlights from the user's profile that match the role.
- A recent company event, blog post, or product detail as a conversation hook.
- The user's preferred tone setting.

The user sees all drafts in a review screen — one per contact. They can edit any draft inline before sending. No message is sent without the user seeing it first.

---

### Step 6 — Send

The user reviews the final drafts and clicks "Send All" or sends individually per contact.

Emails are sent from the user's connected email account. The platform logs:
- Who was contacted
- Which company and role
- The message sent
- Date and time

A confirmation screen shows the outreach summary.

---

## 5. Key Screens (MVP)

| Screen | Purpose |
|---|---|
| Profile page | View/edit resume and preferences |
| Company search | Enter company name to start the pipeline |
| Company summary card | Review what the research agent found |
| Contacts list | Review and curate discovered contacts |
| Draft review | Edit and approve outreach messages |
| Send confirmation | Confirm send and view outreach log |

---

## 6. Agents Overview

| Agent | Responsibility |
|---|---|
| Research agent | Gathers company info, job postings, recent news |
| People-finder agent | Finds relevant employees and their email addresses |
| Drafting agent | Writes personalised outreach emails per contact |
| Orchestrator | Coordinates the above agents and manages state between steps |

Each agent runs sequentially. The user has a review/approval checkpoint between Step 3→4 and Step 5→6.

---

## 7. Assumptions

- Emails are sent via the user's connected Gmail or SMTP account.
- Email addresses are either found directly (LinkedIn, website) or inferred from known company patterns (e.g. firstname.lastname@company.com).
- The user's profile is stored locally or in a simple backend; no auth is required for MVP.
- The platform will not send anything without explicit user approval at the draft review step.

---

## 8. Success Metrics (Post-launch)

- Time from company input to draft ready (target: under 3 minutes).
- User edits per draft (lower = better quality drafts).
- % of generated contacts the user approves (quality signal).
- Reply rate on sent emails (lagging indicator of overall quality).

---

## 9. Open Questions

1. Which data sources will the people-finder agent use? (LinkedIn scraping has ToS restrictions — may need a third-party enrichment API like Hunter.io or Apollo.)
2. Should the user be able to run multiple companies in parallel, or one at a time for MVP?
3. How should the platform handle cases where no relevant jobs are found — should it still allow outreach?
4. What happens to drafted messages if the user closes the browser mid-flow?