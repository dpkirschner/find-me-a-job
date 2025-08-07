Use Case 1: Adding and Researching a New Application 👩‍💻
This scenario demonstrates how a user populates their pipeline and kicks off the initial, automated data gathering.

Find a Job: You find an interesting "Senior AI Engineer" role at "Acme Corp" on a job board and copy the URL.

Add to Dashboard: You open AgentDeck and click the "Add Application" button. You paste the URL and manually enter "Acme Corp" and "Senior AI Engineer." A new card instantly appears on your dashboard in the "Identified" column.

Initiate Research: You click the new card to open the application's detail view. In the chat window with the Orchestrator agent, you type a simple command: Research this position.

Automated Work Begins: The system acknowledges the command and updates the application's status to "Researching," both in the UI and on the main dashboard. A background job starts.

Data Ingestion: In the background, the Researcher agent uses the Playwright tool to visit the URL, scraping the full text of the job description. This content is then chunked, converted into embeddings, and stored in the ChromaDB vector store.

Confirmation: A few moments later, the Orchestrator posts a message in the chat: Initial research complete. I've saved the job description details. Ready for your questions.

Use Case 2: Interacting with Research Data 📝
This scenario shows how you can leverage the agent's memory to quickly extract key information without re-reading the entire job description.

Ask a Question: You're in the same "Acme Corp" application view. Instead of hunting through the job description text, you ask the Orchestrator: What are the top 3 required skills for this role?

AI-Powered Retrieval: The system doesn't just do a keyword search. It uses your question to perform a semantic search against the vector store (ChromaDB). It finds the most relevant chunks of the job description related to skills and requirements.

Synthesized Answer: The Llama 3 model receives these chunks and synthesizes them into a natural language answer, which appears in the chat: The top 3 required skills appear to be: 1) 5+ years of experience with Python, 2) hands-on experience with PyTorch or TensorFlow, and 3) a strong background in building and deploying LLM-based applications.

Add a Personal Note: You remember a detail you want to save. You type: /note I already know their tech lead, Jane Doe. The system recognizes this as a command and saves this text as a private note attached to the application in the SQLite database, confirming with: Note saved.

Use Case 3: Drafting Application Materials 🚀
This scenario demonstrates how AgentDeck helps with the most tedious part of the process: creating tailored documents.

Request a Draft: You've decided to apply. You update the application's status to "Drafting" and type a new command to the Orchestrator: Draft a cover letter.

The Writer Agent Activates: A new background job begins. The Writer agent gathers three key pieces of information:

Your base resume (from a pre-configured local file).

The scraped job description details (from ChromaDB).

Your saved personal notes for this application (from SQLite).

AI-Powered Generation: The agent combines this context into a detailed prompt for the Llama 3 model, asking it to generate a cover letter that highlights how your experience aligns with the job's requirements.

File Creation & Notification: The generated text is saved as a new Markdown file on your computer (e.g., ~/agentdeck_output/acme_corp_cover_letter.md). The system logs this file's path in the generated_documents table.

Final Confirmation: The Orchestrator posts a final message in the chat: Draft complete. I've created a cover letter that emphasizes your Python and LLM experience. You can review it here: [link to local file].