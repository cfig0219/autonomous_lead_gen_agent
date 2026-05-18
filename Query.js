/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUERY CLASS - Query Formatting & API Configuration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Encapsulates all query formatting logic and provides consolidated
 * API validation and configuration. Acts as the single source of truth for
 * how queries are formatted and how APIs should be called.
 * 
 * METHODS:
 * - constructor() - Initialize with location and queries
 * - location, rawQueries (getters/setters) - Access private fields
 * - getGoogleMapsRequests() - Format queries for Places API
 * - getPlaceDetailsRequest() - Format request for getDetails() API
 * - getGeminiPayload() - Format payload for Gemini API
 * - validateAPIConfiguration() - Check if APIs are ready to use
 * - getAPITimeouts() - Get timeout values for each API
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class Query {
    #location;   // Private fields to ensure encapsulation
    #rawQueries;

    constructor(location, queries = []) {
        this.#location = location ? location.trim() : '';
        this.#rawQueries = Array.isArray(queries) ? queries : [queries];
    }

    // --- GETTERS & SETTERS ---
    get location() {
        return this.#location;
    }

    set location(newLocation) {
        this.#location = newLocation ? newLocation.trim() : '';
    }

    get rawQueries() {
        return this.#rawQueries;
    }

    set rawQueries(newQueries) {
        this.#rawQueries = Array.isArray(newQueries) ? newQueries : [newQueries];
    }

    // --- API CONFIGURATION & VALIDATION ---
    /**
     * Consolidated API validation - checks if prerequisites are met for API calls
     * Replaces scattered validation across Search.js methods
     * @returns {Object} { isValid: boolean, errors: [string] }
     */
    validateAPIConfiguration() {
        const errors = [];

        // Validate location
        if (!this.#location || this.#location.trim() === '') {
            errors.push('Location/Zip code is required');
        }

        // Validate queries
        if (!this.#rawQueries || this.#rawQueries.length === 0) {
            errors.push('At least one search query is required');
        }

        // Validate Google Maps is available in window
        if (!window.google || !window.google.maps || !window.google.maps.places) {
            errors.push('Google Maps SDK not loaded');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get timeout values for all API calls
     * Centralized timeout configuration - change once, updates everywhere
     * @returns {Object} { textSearch, getDetails, gemini } in milliseconds
     */
    getAPITimeouts() {
        return {
            textSearch: 10000,    // 10 seconds for initial search
            getDetails: 5000,     // 5 seconds for detail fetching
            gemini: 30000         // 30 seconds for Gemini processing
        };
    }

    // --- GOOGLE MAPS QUERY GENERATION ---
    /**
     * Compiles raw business queries into strictly bounded location strings.
     * @returns {Array<Object>} Array of request configurations for Places textSearch API
     * 
     * Example:
     *   Input: query = "aerospace companies"
     *   Output: { raw, compiledQuery: "aerospace companies in 10025", gmapsPayload }
     */
    getGoogleMapsRequests() {
        if (!this.location) { // updated from private reference if using getters
            throw new Error("Cannot format Google Maps queries: Location/Zip code is missing.");
        }

        return this.rawQueries.map(query => {
            const cleanQuery = query.trim();
            const fullQueryString = `${cleanQuery} in ${this.location}`;
            
            return {
                raw: query,
                compiledQuery: fullQueryString,
                // Ensure this payload matches the exact options expected by Place.searchByText
                gmapsPayload: {
                    textQuery: fullQueryString,
                    fields: ['id', 'displayName', 'formattedAddress'] 
                }
            };
        });
    }

    /**
     * Format a request for Places getDetails() API
     * Provides consistent field specification for detail requests
     * @param {string} placeId - Place ID from textSearch results
     * @returns {Object} Request configuration for getDetails()
     */
    getPlaceDetailsRequest(placeId) {
        if (!placeId) {
            throw new Error("Place ID is required for getDetails request");
        }

        return {
            placeId: placeId,
            fields: ['name', 'formatted_address', 'formatted_phone_number', 'website', 'geometry']
        };
    }

    // --- GEMINI PROMPT GENERATION ---
    /**
     * Builds the final system instructions and structures data payload for Gemini.
     * @param {Array} rawPlacesData - The hydrated payload from Google Places getDetails
     * @returns {Object} JSON configuration ready for Gemini API fetch body
     */
    getGeminiPayload(rawPlacesData) {
        if (!rawPlacesData || rawPlacesData.length === 0) {
            throw new Error("Cannot format Gemini prompt: Places payload data is empty.");
        }

        const promptContext = `You are a precise data extraction engine.
TASK: Analyze the provided raw Google Places dataset and format it into structured, valid JSON matching the exact schema required. 
CRITICAL DATA MAPPING: Extract 'formatted_phone_number' and map it to the 'phone' property. Extract 'website' and map it to the 'website' property. If either field is missing in the source data, output null.

Raw Places Input Data:
${JSON.stringify(rawPlacesData, null, 2)}`;

        return {
            contents: [{ parts: [{ text: promptContext }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        companies: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    name: { type: "STRING" },
                                    phone: { type: "STRING", nullable: true },
                                    website: { type: "STRING", nullable: true },
                                    address: { type: "STRING" }
                                },
                                required: ["name", "address"]
                            }
                        }
                    }
                },
                temperature: 0.1
            }
        };
    }
}
