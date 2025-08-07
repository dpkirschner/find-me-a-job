Of course. Here is a product brief for the AI job search assistant.

***

## Product Brief: AgentDeck

**AgentDeck** is a local-first, AI-powered command center designed to streamline and automate the modern technical job search. It acts as a personal team of AI agents that handle the repetitive and time-consuming tasks of job hunting, allowing you to focus on what matters: landing the right role.



---

### **Problem & Use Case** 🎯

The modern job search is a disorganized and laborious process. Professionals spend countless hours searching for roles, researching companies, tailoring resumes, and writing unique cover letters for each application. This repetitive work leads to burnout and makes it difficult to track progress across dozens of opportunities.

**AgentDeck** is built for the tech professional (e.g., software/AI engineer) who wants to run an efficient, organized, and effective job search right from their own machine, without relying on third-party services or sacrificing privacy.

---

### **Solution & Core Concept** 🤖

The core of **AgentDeck** is a collaborative, multi-agent system that runs entirely on your local machine. You interact with a lead **Orchestrator** agent that manages your entire application pipeline. When you give it a high-level goal, like "Apply for the Senior Engineer role at Acme Corp," it intelligently delegates sub-tasks to a team of specialized agents:

* A **Researcher** agent automatically scrapes the company's website and the job description to gather key insights.
* A **Writer** agent takes that research and your base resume to generate a tailored draft and a unique cover letter.

All activity is tracked in a central dashboard, giving you a bird's-eye view of every application's status.

---

### **Key Features** 🚀

* **Application Dashboard:** A Kanban-style board to track every job application from "Identified" to "Applied."
* **Collaborative AI Agents:** A persistent team of agents (**Orchestrator**, **Researcher**, **Writer**) that work together to execute complex tasks.
* **Automated Research:** One-click deep dives into companies and job roles using robust web scraping tools.
* **Tailored Document Generation:** AI-powered creation of customized resumes and cover letters based on specific job descriptions.
* **Persistent & Private Memory:** All conversations, research notes, and generated documents are stored locally in a relational database (SQLite) and a vector store (ChromaDB), ensuring your data remains private.

---

### **Technology Stack** 🛠️

* **Local AI Model:** **Ollama** serving a Llama 3.1 model.
* **Agent Orchestration:** **LangGraph** to define and manage agent collaboration.
* **Backend API:** **FastAPI** (Python) for a high-performance server.
* **Web Scraping:** **Playwright** for robustly handling modern, dynamic websites.
* **Database:** **SQLite** for relational data (applications, messages) and **ChromaDB** for vector-based memory (research notes).
* **Frontend UI:** **Next.js** (React) for a responsive and interactive dashboard.