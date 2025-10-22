------------------------
**The Tenant's Voice: AI-Powered Tenancy Guidance**
------------------------
www.thetenantsvoice.uk


For a detailed analysis of the product decisions, architecture choices, and technical trade-offs (including LLM selection) made during the build process, please see the [**Product Build Decisions document**](https://github.com/OscarC178/Tenant-Voice-Website-/blob/main/Product_build_decisions.md).


The Tenant's Voice is a free web application designed to empower UK tenants by providing instant, AI-powered guidance on tenancy issues. It uses a Retrieval-Augmented Generation (RAG) pipeline to answer questions about deposit disputes, repairs, and evictions, grounding its answers in a database of official UK tenancy law.

## **The Problem ("Why I Built This")**

This tool was born from a personal and frustrating experience. A landlord attempted to unfairly deduct £2,625 from a tenancy deposit. By manually researching UK tenancy law (specifically "fair wear and tear" and "betterment") and using AI to draft a formal rebuttal, we successfully contested the claim and had £2,350 returned.

This process was stressful, time-consuming, and opaque. I realized that most tenants don't have the time or resources to do this, leaving them at a significant disadvantage.

I built The Tenant's Voice to productize that winning process. It's a tool to give tenants the same high-quality, grounded information and confidence I had, helping them understand their rights and defend themselves.

## **Features & Functionality**

* **AI Guidance Chat:** Users can describe their tenancy problem in plain English. The AI analyzes their situation and provides a summary of their rights and the law, citing its sources.  
* **Retrieval-Augmented Generation (RAG):** The app doesn't just "guess." It translates the user's query into a vector embedding, searches a database of official UK tenancy documents (from sources like Shelter, Citizens Advice, and gov.uk), and then uses that context to provide a safe and accurate answer.  
* **Dynamic Action Toolkit:** Based on the user's problem, the app suggests relevant next steps, such as drafting a formal email to a landlord, preparing for a call with the council, or writing a dispute message.  
* **Location-Aware Council Finder:** Allows users to enter their postcode to quickly find links for their specific local council's housing department and environmental health services.

## **How It Works (Tech Stack)**

The application is a modern, serverless web app built for speed and accuracy.

* **Frontend:** Vanilla JavaScript, HTML5, and Tailwind CSS.  
* **Backend:** Supabase (PostgreSQL Database, Auth, and Vector Store via pgvector).  
* **AI Pipeline (RAG):** A Deno-based Supabase Edge Function (index.ts) that:  
  1. Receives the user's query.  
  2. Generates an embedding using Google's text-embedding-004 model.  
  3. Performs a vector search against the Supabase DB (match\_documents RPC) to find relevant legal context.  
  4. Passes the query and the context to Google's gemini-2.5-flash model.  
  5. Returns a structured JSON object to the frontend with the answer and suggested actions.

## **Product & Engineering Deep Dive**
Please see the [**Product Build Decisions document**](https://github.com/OscarC178/Tenant-Voice-Website-/blob/main/Product_build_decisions.md).
