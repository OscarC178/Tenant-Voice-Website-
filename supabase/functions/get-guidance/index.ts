import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai'

// The corsHeaders are now directly inside this file to solve the import error
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log(`Function "get-guidance" has been initialized.`);

// --- Sanitizer function to handle special characters ---
function sanitizeForJSON(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/"/g, '\\"')  // Escape double quotes
    .replace(/\n/g, '\\n')  // Escape newlines
    .replace(/\r/g, '\\r')  // Escape carriage returns
    .replace(/\t/g, '\\t'); // Escape tabs
}
// --- END NEW ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, chatHistory } = await req.json()
    console.log("Step 1: Parsed request body. Query:", query);

    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY')
    if (!googleApiKey) throw new Error('Missing Google AI API Key')
    console.log("Step 2: Retrieved Google AI API Key.");
    
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    console.log("Step 3: Supabase client initialized.");

    const genAI = new GoogleGenerativeAI(googleApiKey)
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' })
    const chatModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    console.log("Step 4: Google AI models initialized.");

    const sanitizedHistory = chatHistory.map(m => ({
        ...m,
        text: sanitizeForJSON(m.text)
    }));
    const historyText = sanitizedHistory.map(m => `${m.sender}: ${m.text}`).join('\n');

    const searchQueryPrompt = `Based on the following conversation history and the latest user query, generate a single, concise, and detailed search query that captures the core of the user's legal problem.

      Conversation History:
      ${historyText}

      Latest User Query: "${sanitizeForJSON(query)}"

      Optimized Search Query:`
    
    const searchQueryResponse = await chatModel.generateContent(searchQueryPrompt);
    const hypotheticalSearchQuery = searchQueryResponse.response.text();
    console.log("Step 5a: Created hypothetical search query:", hypotheticalSearchQuery);
    
    const embeddingResponse = await embeddingModel.embedContent({
      content: { parts: [{ text: hypotheticalSearchQuery }] },
      task_type: "RETRIEVAL_QUERY"
    })
    const queryEmbedding = embeddingResponse.embedding.values
    console.log("Step 5b: Successfully created embedding for the smarter query.");

    const { data: documents, error } = await supabaseClient.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    })

    if (error) {
      console.error("Supabase RPC error:", error);
      throw new Error(`Failed to match documents: ${error.message}`);
    }
    console.log(`Step 6: Found ${documents.length} matching documents.`);

    const contextText = documents.map((doc) => doc.content).join('\n\n---\n\n')
    
    // --- START: MODIFICATION FOR get-guidance/index.ts ---
const fullPrompt = `You are an expert AI assistant providing guidance to UK tenants.

  Your Task:
  Based ONLY on the provided LEGAL CONTEXT and CONVERSATION HISTORY, generate a response in a specific JSON format.

  Here are the steps to follow:
  1. Analyze Conversation Stage:
      - If this is the FIRST message (history is empty), the tone should be empathetic and reassuring.
      - If this is a FOLLOW-UP, be more direct and action-oriented.
  2. Analyze Context: Determine if the LEGAL CONTEXT provides enough information to answer the user's latest question.
  3. Formulate the Response:
      - If SUFFICIENT:
          - In the "text" field, state the core legal problem, then provide a short, bulleted list of next steps for the tenant.
          - In the "actions" field, include an array of relevant action keys. You MUST suggest at least one from this list: ['email_landlord', 'email_council', 'call_council', 'dispute_message', 'step_by_step_guide'].
      - If INSUFFICIENT:
          - In the "text" field, explain the potential issue and ask specific, clarifying questions to get the information you need.
          - In the "actions" field, return an empty array [].
  4. Provide Analysis:
      - In the "analysis.confidence" field, provide a confidence level (e.g., "High", "Medium", "Low") based on how well the context matches the query.

  Conversation & Context:
  PREVIOUS CONVERSATION: ${JSON.stringify(sanitizedHistory)}
  LEGAL CONTEXT FROM DATABASE: ${sanitizeForJSON(contextText)}
  USER'S LATEST QUESTION: "${sanitizeForJSON(query)}"

  IMPORTANT: You MUST return your complete response as a single, valid JSON object enclosed in markdown code fences. The JSON object MUST have this exact structure:
  {
    "text": "The main response to the user...",
    "actions": ["action_key_1", "action_key_2"],
    "analysis": {
      "confidence": "High"
    }
  }`
// --- END: MODIFICATION FOR get-guidance/index.ts ---return your complete response as a single, valid JSON object, enclosed in markdown format.`
    console.log("Step 7: Constructed final prompt for Gemini.");

    const result = await chatModel.generateContent(fullPrompt);
    const responseText = result.response.text();
    console.log("Step 8: Received raw response from Gemini.");
    
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch || !jsonMatch[1]) {
      const fallbackMatch = responseText.match(/{[\s\S]*}/);
      if (!fallbackMatch) {
        throw new Error("AI did not return a valid JSON object in the expected format.");
      }
      const responseData = JSON.parse(fallbackMatch[0]);
      console.log("Step 9: Parsed JSON from Gemini response (fallback).");
      responseData.sources = documents.filter(doc => doc.source_url).map(doc => ({ title: doc.source_url, url: doc.source_url }));
      return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    const responseData = JSON.parse(jsonMatch[1]);
    console.log("Step 9: Parsed JSON from Gemini response (primary).");

    responseData.sources = documents
        .filter(doc => doc.source_url)
        .map(doc => ({ title: doc.source_url, url: doc.source_url }));

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("An error occurred:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})