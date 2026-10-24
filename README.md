# Kindred Tap — Meaningful Connections, Smarter Interactions

**Kindred Tap** is a digital platform designed to make professional connections, workplace communication, and information sharing simpler and more accessible. It combines secure authentication, QR codes and shareable links, controlled access, and an AI-powered chatbot to create a more connected digital experience.

🌐 **Live Website:** https://www.kindredtap.com/  
🔌 **API Endpoint:** https://kindred-tap.vercel.app/  
💬 **AI Assistant:** Ask Cube, powered by Google Gemini

---

## 📌 Table of Contents

- [Overview](#-overview)
- [The Problem](#-the-problem)
- [Our Solution](#-our-solution)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [AI Assistant — Ask Cube](#-ai-assistant--ask-cube)
- [Technology Stack](#-technology-stack)
- [System Architecture](#-system-architecture)
- [Security and Privacy](#-security-and-privacy)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Overview](#-api-overview)
- [Deployment](#-deployment)
- [Testing Instructions](#-testing-instructions)
- [Challenges and Learnings](#-challenges-and-learnings)
- [Future Roadmap](#-future-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

---

## 🌟 Overview

Kindred Tap explores how modern web technologies and artificial intelligence can improve digital communication and professional interactions.

The platform focuses on three core ideas:

1. **Connect:** Make it easier for people to access relevant information and connect through simple digital experiences.
2. **Control:** Use authentication and controlled sharing to help protect access to company or community resources.
3. **Assist:** Provide an AI-powered conversational assistant that helps users find information and navigate the platform.

Our goal is to build an accessible, practical, and scalable experience that brings people and useful information closer together.

## ❗ The Problem

Digital communication often involves unnecessary friction:

- Finding relevant company or community information can be time-consuming.
- Sharing resources with the right people can be complicated.
- Uncontrolled sharing can create access and privacy concerns.
- Users frequently need help understanding a platform's features and available information.
- Traditional support systems may require users to search through multiple pages or wait for assistance.

These challenges can make digital interactions less efficient than they should be.

## 💡 Our Solution

Kindred Tap brings essential interactions into one accessible platform.

By combining QR-code and link-based access, email verification, controlled sharing, and an AI assistant, the platform aims to reduce friction while keeping access management in mind.

Instead of navigating complicated processes, users can access supported resources through a straightforward interface and use Ask Cube for conversational assistance.

## 🚀 Key Features

### 1. QR-Code and Shareable-Link Access

- Simplifies access to supported digital resources.
- Provides a convenient way to share links.
- Supports a user-friendly experience across devices.
- Enables future expansion into additional workplace and community use cases.

### 2. Email Verification and Authentication

- Supports account registration and login.
- Uses email-based verification for account-related workflows.
- Helps establish authenticated user sessions.
- Provides a foundation for access-controlled platform features.

### 3. Controlled Sharing

Kindred Tap is designed around more intentional resource sharing.

The planned company-sharing workflow includes company email verification, subscription-based access, and limits on the number of permitted recipients. The precise limits depend on the configured product rules.

### 4. Ask Cube — AI-Powered Assistant

Ask Cube integrates Google Gemini to help users interact with the platform conversationally.

The assistant is intended to support:

- Questions about the platform.
- Navigation and feature guidance.
- Answers based on available website information.
- General conversational interactions.
- Faster discovery of relevant information.

Retrieval-augmented generation (RAG) can be used to ground answers in curated platform documentation where configured.

### 5. Responsive Web Experience

- Accessible through a modern web browser.
- Designed for straightforward navigation.
- Supports a responsive interface for different screen sizes.
- Provides a foundation for future feature expansion.

### 6. API-Driven Architecture

- Separates frontend experiences from backend operations.
- Uses a Node.js API for supported server-side functionality.
- Connects application services with Supabase.
- Supports deployment using web-based hosting infrastructure.

## 🔄 How It Works

The intended user workflow is:

1. **Visit:** Open the Kindred Tap website.
2. **Authenticate:** Register or sign in using the available authentication flow.
3. **Verify:** Complete the required email verification where applicable.
4. **Access:** Open supported resources through the website, QR codes, or shareable links.
5. **Share:** Share resources according to the configured access rules.
6. **Ask:** Use Ask Cube to ask questions about the platform and its available information.

The exact steps can vary depending on the feature being used and the current deployment configuration.

## 🤖 AI Assistant — Ask Cube

Ask Cube is Kindred Tap's conversational AI component, powered by Google Gemini.

### How it helps

Rather than requiring users to manually search every page, Ask Cube provides a conversational interface for asking questions and discovering information.

### AI workflow

1. A user submits a question.
2. The application sends the request through its configured chatbot integration.
3. Where retrieval is enabled, relevant information can be retrieved from the configured knowledge base.
4. Gemini generates a response using the available context.
5. The response is returned to the user through the chat interface.

### Responsible AI considerations

- Responses may occasionally be inaccurate.
- Important information should be verified when necessary.
- Private credentials and API keys must not be exposed in client-side code.
- The assistant should not be treated as a substitute for professional advice in high-stakes situations.

**Technology:** Google Gemini API, Node.js integration, and a retrieval-based knowledge workflow where configured.

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Web application technologies |
| Backend | Node.js |
| Database and backend services | Supabase |
| AI integration | Google Gemini |
| AI knowledge retrieval | RAG workflow, where configured |
| Authentication | Email-based verification and supported authentication flows |
| Hosting | Vercel |
| Source control | Git and GitHub |
| API communication | HTTP/REST-style endpoints |

The table describes the project architecture at a high level. Confirm the repository's package files before documenting exact frontend frameworks, libraries, or dependency versions.

## 🏗️ System Architecture

```text
                 ┌──────────────────────┐
                 │       User           │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │  Kindred Tap Website │
                 │   Responsive UI      │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │   Node.js API        │
                 │ Authentication       │
                 │ Application Logic    │
                 └────────┬───────┬─────┘
                          │       │
                  ┌───────▼───┐ ┌─▼────────────────┐
                  │ Supabase │ │ Google Gemini    │
                  │ Data and │ │ Ask Cube         │
                  │ Services │ │ AI Integration   │
                  └──────────┘ └──────────────────┘
```

**Deployment model:** The website and API use Vercel deployment infrastructure, while Supabase provides configured backend services and Google Gemini provides the AI integration.

## 🔐 Security and Privacy

Security is an important consideration in Kindred Tap's design.

The application should follow these principles:

- **Authentication:** Require authentication for protected operations.
- **Email verification:** Verify email addresses where required by the workflow.
- **Access control:** Enforce sharing and authorization rules on the server.
- **Credential protection:** Store API keys and other secrets in environment variables.
- **Input validation:** Validate user input before processing it.
- **Database security:** Configure appropriate Supabase Row Level Security (RLS) policies where applicable.
- **Password protection:** Use secure password hashing when passwords are managed by the application itself.
- **Session management:** Apply appropriate session expiration and invalidation rules.
- **Data minimization:** Collect and retain only information needed for the application's purpose.

Security controls must be verified against the actual implementation before the project is described as production-secure. A frontend restriction alone is not sufficient to enforce access permissions.

## 💻 Getting Started

Follow these steps to run the project locally.

### Prerequisites

Install the following tools:

- [Node.js](https://nodejs.org/) — use a version compatible with the project.
- npm — included with Node.js.
- [Git](https://git-scm.com/).
- A Supabase project with the required services configured.
- A Google Gemini API key if you want to run the AI assistant.

### 1. Clone the Repository

Replace the repository URL below with the actual GitHub repository URL if it differs.

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd <YOUR_PROJECT_DIRECTORY>
```

### 2. Install Dependencies

If the project has a root-level `package.json`, run:

```bash
npm install
```

If the frontend and backend are separate applications, install dependencies in their respective directories using the instructions in their package files.

### 3. Configure Environment Variables

Create a `.env` file in the directory expected by the application.

Add the required Supabase and Gemini configuration using the variable names already defined in your source code.

Never commit real credentials to GitHub.

### 4. Start the Application

Check the scripts in `package.json` and run the appropriate development command. For a project that defines the standard `dev` script, use:

```bash
npm run dev
```

If the backend runs separately, start it using its own documented script.

### 5. Open the Application

Use the local URL printed in your terminal. For many frontend development servers this is:

```text
http://localhost:3000
```

The actual port depends on the framework and project configuration.

## 🔑 Environment Variables

The application needs environment variables matching its actual source code.

Example configuration template:

```dotenv
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Google Gemini
GEMINI_API_KEY=

# Backend
PORT=3000

# Frontend API configuration, if required
API_URL=
```

**Important:** These names are illustrative placeholders, not a guarantee that every variable matches the current codebase. Check the existing configuration files and replace them with the exact names expected by your implementation.

Keep secret values out of public frontend variables. Only expose credentials specifically intended for public client-side use, and configure database access policies accordingly.

## 🔌 API Overview

The deployed API is associated with:

```text
https://kindred-tap.vercel.app/
```

Previously identified application routes include the following:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check API health |
| GET | `/api/meta/portals` | Retrieve portal metadata |
| GET | `/api/meta/options` | Retrieve supported metadata options |
| POST | `/api/auth/signup` | Register an account |
| POST | `/api/auth/login` | Authenticate a user |
| GET | `/api/auth/me` | Retrieve the current user's authentication information |
| POST | `/api/auth/logout` | End the current session |

Availability and response formats depend on the currently deployed version. Confirm each route against the backend before relying on it.

### Health-check example

```bash
curl https://kindred-tap.vercel.app/api/health
```

A successful response indicates that the endpoint is reachable and responding; it does not necessarily prove that every dependent service is healthy.

## ☁️ Deployment

Kindred Tap uses Vercel for its deployed web application and API, with Supabase and Google Gemini configured for their respective services.

### Frontend

1. Push the frontend source code to GitHub.
2. Import the repository into Vercel.
3. Configure the correct framework and build settings.
4. Add the required public environment variables.
5. Deploy and test the website.

Website: https://www.kindredtap.com/

### Backend

1. Configure the backend entry point and build settings.
2. Add the required server-side environment variables.
3. Confirm API routes and database connectivity.
4. Deploy the backend using the configured Vercel project.
5. Test health and authentication endpoints.

API: https://kindred-tap.vercel.app/

### Database and AI

- Configure Supabase credentials and access policies.
- Configure the Gemini API key securely.
- Test authentication, database operations, and chatbot responses.
- Check application logs for failed requests and configuration errors.

### Deployment considerations

- Do not commit `.env` files.
- Use separate development and production configuration.
- Verify the production domain and CORS settings where applicable.
- Test the deployed application after every significant change.

## 🧪 Testing Instructions

To evaluate the deployed project:

1. Open https://www.kindredtap.com/.
2. Check that the website loads correctly.
3. Navigate through the available pages and features.
4. Test account registration and login using the supported workflow.
5. Verify the email flow if email verification is enabled.
6. Open Ask Cube and submit a general question.
7. Test a question about the platform's documented features.
8. Test the API health endpoint at `https://kindred-tap.vercel.app/api/health`.
9. Check browser and server logs for errors if any feature fails.

Use an authorized test account and avoid submitting real personal or confidential information.

**Testing note:** These are evaluation instructions, not a claim that every test has already passed. Features that require external credentials, email configuration, or specific access permissions may need additional setup.

## 🧠 Challenges and Learnings

### Challenges

- Connecting frontend interactions with backend services.
- Configuring environment variables across local and deployed environments.
- Integrating a generative AI assistant into a web application.
- Designing a straightforward user experience around authentication and controlled sharing.
- Maintaining reliable API communication across deployed services.

### What We Learned

- How to organize a web application around frontend, backend, and database responsibilities.
- How to integrate an external AI service into a product workflow.
- Why secure configuration and server-side authorization matter.
- How deployment environments affect application behavior.
- How to translate a product idea into a working, testable digital experience.

## 🗺️ Future Roadmap

Potential improvements include:

- [ ] More comprehensive company and organization dashboards.
- [ ] Enhanced QR-code and link-sharing workflows.
- [ ] Configurable recipient limits and subscription management.
- [ ] Improved email verification and account recovery.
- [ ] More extensive Ask Cube knowledge-base coverage.
- [ ] Better source-grounded AI answers and response evaluation.
- [ ] Administrative tools for managing access and content.
- [ ] Expanded automated testing and deployment checks.
- [ ] Improved accessibility and mobile responsiveness.
- [ ] Monitoring, analytics, and performance optimization.

These items represent possible future development, not necessarily completed features.

## 🤝 Contributing

Contributions, feedback, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement and test your changes.
4. Commit your work with a descriptive message.
5. Open a pull request explaining the changes.

Please avoid committing API keys, passwords, personal data, or other secrets.

## 📄 License

Choose and add an appropriate open-source license before distributing the source code publicly. Until a license is included, do not assume that others have permission to reuse, modify, or redistribute the project.

## 👨‍💻 Contact

**Project:** Kindred Tap  
**Developer:** Rehan Ilyas  
**GitHub:** [rehanilyas20196-design](https://github.com/rehanilyas20196-design)  
**LinkedIn:** [Rehan Ilyas](https://linkedin.com/in/rehan-ilyas-6976793a7)  
**Website:** https://www.kindredtap.com/

---

<p align="center">

**Kindred Tap — Your space for meaningful connections, smarter interactions, and seamless digital experiences.**

</p>
