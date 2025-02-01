import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { pipeline } from "@xenova/transformers";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

// Error classification for RAG system
class RAGError extends Error {
  constructor(message, type, details = {}) {
    super(message);
    this.name = "RAGError";
    this.type = type;
    this.details = details;
  }
}

/**
 * Creates a FAISS vector store from provided events with comprehensive error handling
 * @param {Array} events - Array of NDK events to process
 * @returns {Promise<{store: FaissStore, diagnostics: Object}>} Store and initialization diagnostics
 * @throws {RAGError} Classification-specific error information
 */
export async function createFaissRag(events) {
  const diagnostics = {
    processedEvents: 0,
    totalTokens: 0,
    embeddingDimensions: 0,
    initializationTime: 0,
  };

  const startTime = performance.now();

  try {
    // Validate input
    if (!events?.length) {
      throw new RAGError(
        "No events provided for RAG initialization",
        "INPUT_VALIDATION",
        { eventsReceived: events?.length || 0 },
      );
    }

    // Initialize embedding pipeline
    const embedder = await pipeline(
      "feature-extraction",
      "mixedbread-ai/mxbai-embed-xsmall-v1",
    ).catch((error) => {
      throw new RAGError(
        "Failed to initialize embedding pipeline",
        "EMBEDDER_INITIALIZATION",
        { originalError: error.message },
      );
    });

    // Process documents
    const documents = await Promise.all(
      events.map(async (event) => {
        try {
          const title = event.getMatchingTags("title")?.[0]?.[1] || "Untitled";
          const content = event.content || "";

          diagnostics.processedEvents++;

          return {
            pageContent: `Title: ${title}\n\nContent: ${content}`,
            metadata: {
              title,
              eventId: event.id,
              created: event.created_at,
              length: content.length,
            },
          };
        } catch (error) {
          throw new RAGError(
            "Failed to process event document",
            "DOCUMENT_PROCESSING",
            {
              eventId: event.id,
              originalError: error.message,
            },
          );
        }
      }),
    );

    // Generate embeddings
    const embeddings = await Promise.all(
      documents.map(async (doc) => {
        try {
          const result = await embedder(doc.pageContent, {
            pooling: "mean",
            normalize: true,
          });

          // Update diagnostics
          diagnostics.embeddingDimensions = result.data.length;
          diagnostics.totalTokens += doc.pageContent.split(/\s+/).length;

          return Array.from(result.data);
        } catch (error) {
          throw new RAGError(
            "Failed to generate embeddings",
            "EMBEDDING_GENERATION",
            {
              document: doc.metadata,
              originalError: error.message,
            },
          );
        }
      }),
    );

    // Create vector store
    const store = new FaissStore(embeddings, documents);

    // Finalize diagnostics
    diagnostics.initializationTime = performance.now() - startTime;

    return { store, diagnostics };
  } catch (error) {
    // Preserve error classification if it's already a RAGError
    if (error instanceof RAGError) {
      throw error;
    }

    // Otherwise, wrap in a general RAGError
    throw new RAGError(
      "Unhandled error in RAG initialization",
      "GENERAL_ERROR",
      {
        originalError: error.message,
        diagnostics,
      },
    );
  }
}

/**
 * Performs similarity search with error handling and diagnostics
 * @param {FaissStore} vectorStore - Initialized FAISS store
 * @param {string} query - Search query
 * @param {number} k - Number of results to return
 * @returns {Promise<{results: Array, diagnostics: Object}>} Search results and diagnostics
 */
export async function searchRag(vectorStore, query, k = 3) {
  const searchDiagnostics = {
    queryTime: 0,
    resultsFound: 0,
  };

  const startTime = performance.now();

  try {
    if (!vectorStore) {
      throw new RAGError("Vector store not initialized", "STORE_NOT_READY");
    }

    if (!query?.trim()) {
      throw new RAGError("Invalid search query", "INVALID_QUERY", { query });
    }

    const embedder = await pipeline(
      "feature-extraction",
      "mixedbread-ai/mxbai-embed-xsmall-v1",
    );

    const queryEmbedding = await embedder(query, {
      pooling: "mean",
      normalize: true,
    });

    const results = await vectorStore.similaritySearch(
      Array.from(queryEmbedding.data),
      k,
    );

    searchDiagnostics.queryTime = performance.now() - startTime;
    searchDiagnostics.resultsFound = results.length;

    return { results, diagnostics: searchDiagnostics };
  } catch (error) {
    if (error instanceof RAGError) {
      throw error;
    }

    throw new RAGError("Error performing RAG search", "SEARCH_ERROR", {
      originalError: error.message,
      diagnostics: searchDiagnostics,
    });
  }
}