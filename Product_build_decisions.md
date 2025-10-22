# **Tenant's Voice: Product & Engineering Analysis**

This document provides a "behind-the-scenes" look at the product, architecture, and engineering decisions made while building The Tenant's Voice.

## **1\. The Product Lens (The "Why")**

### **Applying the CIRCLES Product Framework**

The project's scope and direction were defined using a product management framework to ensure it solved the right problem for the right user.

* **C \- Comprehend the Situation:** The project was born from a personal, negative experience: a landlord unfairly attempted to deduct £2,625 from a tenancy deposit. The process of fighting this was opaque, stressful, and time-consuming. The core situation is that a significant power and information imbalance exists between landlords and tenants.  
* **I \- Identify the Customer:** The customer is the **"Frustrated Renter."** This persona is tech-savvy but not a legal expert. They are currently underserved, relying on inefficient (texts, calls) or intimidating (reading dense legal guides) methods to resolve critical issues.  
* **R \- Report the Customer's Needs:** The customer needs a way to:  
  * Quickly understand their specific legal rights.  
  * Feel confident in their standing.  
  * Take a formal, effective next step (e.g., write a formal email).  
  * Achieve this without paying for a lawyer or spending hours on research.  
* **C \- Cut, Through Prioritization:** To launch an effective MVP, the scope was cut to solve only the most critical needs.  
  * **P0 (Must-Have):** A reliable, accurate AI chat that provides grounded legal guidance and actionable next steps. This solves the core information gap.  
  * **P1 (Should-Have):** Location-aware council finder.  
  * **P2 (Nice-to-Have / De-scoped):** A full landlord portal, real-time chat between landlord/tenant, image/video uploads. These were cut as they add massive complexity and shift the focus from *empowerment* to *property management*.  
* **L \- List Solutions:**  
  * **Static Info Website:** A simple blog/FAQ site. (Fails to personalize or provide actionable *tools*).  
  * **B2B SaaS Platform:** A full property management tool sold to landlords. (Solves the wrong problem and serves the wrong user).  
  * **B2C AI-Powered Tool:** A free, direct-to-tenant app that productizes the exact process of "research \-\> draft \-\> dispute." (The chosen solution).  
* **E \- Evaluate Tradeoffs:** The B2C AI Tool (Solution 3\) was chosen. This required accepting several key tradeoffs:  
  * **Tenant-First vs. Landlord-First:** We trade off potential revenue (from B2B SaaS) for mission alignment and user trust.  
  * **Accuracy vs. Speed:** We trade a few hundred milliseconds of latency (for the RAG pipeline) to ensure answers are accurate and trustworthy, which is the app's entire value proposition.  
  * **Anonymity vs. Features:** We trade off features like "conversation memory" to guarantee 100% user privacy and anonymity, which is critical for sensitive legal issues.  
* **S \- Summarize Recommendation:** The recommendation is to build The Tenant's Voice as a free, anonymous, B2C web app. The technical architecture must prioritize accuracy and user trust, leading to a RAG pipeline running on an integrated, low-cost platform (Supabase `pgvector` and Edge Functions).

### **Core Product Decision: Tenant-First (B2C) vs. Landlord-First (B2B)**

The most critical product decision was to build this tool *for tenants*, not for landlords.

* **Why Tenant-First (B2C)?**  
  * **Solve the Founder's Problem:** The project was born from a personal, painful experience as a tenant. This B2C focus directly solves the problem I faced.  
  * **Address the Power Imbalance:** Landlords already have access to resources, legal advice, and property management software. Tenants are the underserved market who face the consequences of an information gap. This tool directly empowers the user group with less power.  
  * **Go-to-Market Simplicity:** A B2C tool can grow organically through word-of-mouth, social media, and communities (e.g., Reddit, Facebook) where tenants share advice.  
  * **Mission-Driven:** The goal is empowerment. A B2C app aligns perfectly with the mission to provide free, accessible help directly to the people who need it.  
* **Why Not Landlord-First (B2B)?**  
  * A landlord-facing tool would be a "Property Management" or "Dispute Resolution" SaaS. This is a crowded B2B market, and the product would become about *business efficiency* rather than *tenant empowerment*.

### **The "Job to be Done"**

* **User:** The "Frustrated Renter."  
* **Job:** "When I have a problem with my tenancy, help me understand my rights and confidently take the correct, formal next step... without me having to pay for a lawyer or spend hours reading dense legal documents."

### **Business Model: 100% Free & Ad-Free**

* **Decision:** The service is 100% free, with no ads or monetization.  
* **Rationale:** The primary goal is to provide trustworthy help to a potentially vulnerable user group. Keeping the service free and ad-free maximizes this trust. It avoids any perceived conflicts of interest and aligns with the core mission of helping people, not profiting from their problems.

## **2\. Architecture & Technical Decisions**

### **Decision 1: The AI Pipeline (RAG)**

The "brain" of the app is a **Retrieval-Augmented Generation (RAG)** pipeline. This pipeline has two distinct parts: the *offline* data preparation and the *online* runtime flow. This two-part approach was a deliberate choice to maximize accuracy, freshness, and relevance.

#### **Data Ingestion Strategy (Offline)**

Before any user runs a query, the source documents (e.g., Shelter guides, gov.uk law) are pre-processed and stored in Supabase with rich metadata. This is a critical step that solves two major RAG problems:

1. **Keyword Generation:** As seen in the database schema, a `keywords` column is pre-generated for each document chunk. This was done by passing the text chunks through an LLM (with a LangChain offline script) to extract key legal terms. This enables powerful hybrid search capabilities.  
2. **Data Freshness (The `priority_date`):** A `priority_date` was added to the data. This is a crucial product decision. In early testing, the RAG pipeline would sometimes pull *outdated laws* that had been superseded. This metadata field allows the retrieval query to *prioritize* or *filter for* the most recent, relevant legal documents, ensuring the guidance is not just accurate but *current*.

#### **The Runtime Flow (Online)**

This is the flow hosted in the Supabase Edge Function (`index.ts`):

1. **Client (`index.html`):** User sends a chat message (e.g., "my landlord won't fix the mould").  
2. **Edge Function (`index.ts`):** The app calls the `get-guidance` Supabase function.  
3. **Query Transformation (AI Keywords):** The user's raw query is first sent to `gemini-2.5-flash` to be rewritten into an *idealized, detailed search query* containing relevant legal keywords.  
4. **Embedding:** This new, AI-generated query is embedded using Google's `text-embedding-004`.  
5. **Retrieval:** This embedding is used to perform a semantic search against the Supabase vector store (`pgvector`) to find the most relevant chunks of text.  
6. **Generation:** The original query *and* the retrieved legal context are passed to `gemini-2.5-flash`.  
7. **Response:** The LLM generates a structured JSON response (answer, actions) which is returned to the user.  
* **Chunking Strategy:**  
  * Before being stored, the source documents (e.g., Shelter guides) were broken down into small, semantically meaningful chunks.  
  * **Rationale:** This is a critical step for RAG accuracy. It ensures that the vector search returns a specific, relevant paragraph (e.g., "a landlord's obligation for heating") rather than an entire 10-page document on "Repairs," which would be too much noise for the LLM to use effectively.  
* **Search Strategy: Multi-Layered Hybrid Search**  
  * The app uses a sophisticated hybrid search strategy that combines multiple techniques:  
  * **1\. AI Query Transformation (Runtime):** As seen in `index.ts` (`searchQueryPrompt`), the user's conversational query (e.g., "my flat is freezing") is first sent to `gemini-2.5-flash` to be rewritten into an "idealized search query" (the `hypotheticalSearchQuery`).  
  * **2\. Semantic Search (Runtime):** This new, AI-generated query is then embedded and used for the `pgvector` semantic search against the document *embeddings*.  
  * **3\. Keyword Filtering (Offline Prep):** The retrieval mechanism can *also* leverage the pre-computed `keywords` column (e.g., "Welsh Ministers," "deposit") that was generated during data ingestion to further refine results.  
  * **Rationale:** This multi-layered approach is far superior to any single method. It ensures that retrieval is based on **semantic intent** (from the user's query), **formal terminology** (from the AI-transformed query), and **explicit topics** (from the pre-computed keywords). This minimizes the chance of the RAG pipeline "missing" a relevant document.

### **Decision 2: Integrated vs. Specialized Architecture**

A "kitchen-sink" approach with multiple specialized services was considered and rejected in favor of a simpler, integrated architecture.

* **Backend: Supabase Edge Function vs. n8n/Multi-Agent Workflow**  
  * **Choice:** Single Supabase Edge Function.  
  * **Alternative:** A multi-step n8n workflow with multiple agents (e.g., one to analyze, one to search, one to respond).  
  * **Rationale:**  
    1. **Lower Latency:** A streamlined serverless function has significantly lower latency than a multi-step workflow. For a real-time chat, speed is critical.  
    2. **Lower Cost:** The single-function design makes one AI call per query (plus one for the query transformation). A multi-agent workflow could triple or quadruple the operational cost for every user message.  
    3. **Simplicity:** A single Deno function is far simpler to build, debug, and maintain than a complex chain of webhooks, making it a more robust solution.  
* **Vector Database: Supabase `pgvector` vs. Pinecone**  
  * **Choice:** Supabase `pgvector`.  
  * **Alternative:** A specialized, separate vector database like Pinecone.  
  * **Rationale:**  
    1. **Cost-Effectiveness:** `pgvector` integrates the vector database directly with the primary PostgreSQL database, which is far more cost-effective than paying for a separate, specialized service.  
    2. **Architectural Simplicity:** This approach reduces the number of services, API keys, and data-syncing jobs to manage, lowering the project's overall complexity and potential points of failure.

### **Decision 3: Stateless vs. Stateful (Conversation Memory)**

* **Decision:** The app is **100% stateless** on the server.  
* **Alternative:** Implementing server-side "conversation memory" to remember what the user said previously.  
* **Rationale:**  
  1. **Privacy & Anonymity:** This was a critical product decision. Tenancy issues are sensitive. A stateless design ensures 100% user anonymity. Implementing server-side memory would require storing sensitive conversation data, introducing significant data privacy and security risks.  
  2. **Cost:** A stateless approach avoids the costs associated with storing a potentially large volume of user conversation data over time.  
  3. **Simplicity:** The app's `index.ts` function is designed to be self-contained. It receives the *entire* (sanitized) chat history from the client, allowing the LLM to have context for the *current request* without the app ever storing that history.

### **Decision 4: Frontend: Vanilla JS vs. React**

* **Decision:** Vanilla JavaScript, HTML, and Tailwind CSS.  
* **Alternative:** A JavaScript framework like React.  
* **Rationale:** This was a pragmatic choice. The app is a single-page interface with one primary function (a chat box).  
  * **Pros:** Zero dependencies, instant load time, no complex build process, and no virtual DOM overhead. It demonstrates a strong understanding of core web fundamentals (DOM manipulation, `fetch` API, event listeners).  
  * **Cons (Why React wasn't needed)::** React would have introduced a build step and library overhead for managing state that was simple enough to be handled by a few JavaScript variables. It would have been engineering for its own sake.

