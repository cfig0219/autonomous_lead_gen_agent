import { config } from './config.js';
import { Query } from './Query.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEARCH CLASS - Lead Generation & Data Aggregation Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Orchestrates the complete workflow for searching businesses using 
 * Google Places API and Gemini AI, then formats and displays the results.
 * 
 * DELEGATION PATTERN:
 * - Query.js handles: All query formatting, API configuration, validation
 * - Search.js handles: API calls, orchestration, UI updates
 * 
 * This separation keeps Search.js focused on orchestration, not configuration.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * METHOD SUMMARY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * constructor(location, queries)
 *   └─ Initializes Search, creates Query engine, validates API keys
 * 
 * validateApiKeys()
 *   └─ Checks Google Maps and Gemini API keys are configured
 * 
 * log(message)
 *   └─ Display messages to on-screen console
 * 
 * loadGoogleMapsSDK()
 *   └─ Dynamically load Google Maps SDK from CDN
 * 
 * getPlaceDetails(placeId)
 *   └─ Fetch phone/website for a single place using Places getDetails() API
 * 
 * fetchPlacesData(query)
 *   └─ Search for businesses: textSearch() + getDetails() for each result
 * 
 * processLeadsWithGemini(rawPlaces)
 *   └─ Format data with Gemini AI using JSON schema
 * 
 * renderTable()
 *   └─ Display results in HTML table
 * 
 * init()
 *   └─ Main orchestration loop: validate → load SDK → search → process → display
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class Search {
    constructor(location, queries) {
        this.gmapsKey = config.GOOGLE_MAPS_API_KEY;
        this.geminiKey = config.GEMINI_API_KEY;
        this.globalLeadsCollection = [];
        
        // Create Query instance for query management and formatting
        try {
            this.queryEngine = new Query(location, queries);
        } catch (err) {
            this.log(`❌ Query initialization error: ${err.message}`);
            this.queryEngine = null;
        }
        
        // Validate API keys immediately when Search is created
        this.validateApiKeys();
    }

    // --- VALIDATION ---
    validateApiKeys() {
        const errors = [];
        
        if (!this.gmapsKey || this.gmapsKey === 'NOT_SET') {
            errors.push('❌ GOOGLE_MAPS_API_KEY is not configured');
        }
        if (!this.geminiKey || this.geminiKey === 'NOT_SET') {
            errors.push('❌ GEMINI_API_KEY is not configured');
        }
        
        if (errors.length > 0) {
            errors.forEach(error => this.log(error));
            this.log('⚠️ Please configure API keys in config.js or set environment variables');
        }
    }

    // --- LOGGING ---
    log(message) {
        const consoleBox = document.getElementById('logConsole');
        if (consoleBox) {
            consoleBox.innerHTML += `<br>> ${message}`;
            consoleBox.scrollTop = consoleBox.scrollHeight;
        }
    }

    // --- GOOGLE MAPS SDK LOADING ---
    /**
     * Dynamically loads the Google Maps SDK from Google's CDN using 
     * modern async best practices to maximize page performance.
     * @returns {Promise<void>} Resolves when the window context is ready
     */
    loadGoogleMapsSDK() {
        return new Promise((resolve, reject) => {
            try {
                // Check if already loaded
                if (window.google && window.google.maps) {
                    this.log('✅ Google Maps SDK already loaded');
                    return resolve();
                }

                // Validate API key before attempting to load
                if (!this.gmapsKey || this.gmapsKey === 'NOT_SET') {
                    this.log('❌ Cannot load Google Maps SDK: API key is not configured');
                    return reject('Google Maps API key not configured');
                }

                // Check if there is an existing script tag to prevent double injection
                const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
                if (existingScript) {
                    if (window.google && window.google.maps) {
                        resolve();
                    } else {
                        existingScript.addEventListener('load', () => resolve());
                        existingScript.addEventListener('error', (e) => reject(e));
                    }
                    return;
                }

                // Global callback interceptor fired natively by Google Maps once unpacked
                window.__googleMapsCallback__ = () => {
                    // FIX: Deactivate the background countdown timer immediately on success
                    if (timeout) clearTimeout(timeout); 
                    
                    this.log('✅ Google Maps SDK loaded successfully');
                    resolve();
                    delete window.__googleMapsCallback__; // Clean up window context
                };

                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.src = `https://maps.googleapis.com/maps/api/js?key=${this.gmapsKey}&libraries=places&loading=async&callback=__googleMapsCallback__`;
                
                // Use timeout from Query engine
                const timeouts = this.queryEngine?.getAPITimeouts() || { textSearch: 20000 };
                
                // Changed to 'let' so it can be cleanly intercepted via closure scoping above
                let timeout = setTimeout(() => {
                    this.log('❌ Google Maps SDK load timeout (20 seconds)');
                    reject('Google Maps SDK load timeout');
                }, timeouts.textSearch);

                script.onerror = () => {
                    if (timeout) clearTimeout(timeout);
                    this.log('❌ Failed to load Google Maps SDK script asset from CDN.');
                    reject('Failed to load Google Maps SDK');
                };

                document.head.appendChild(script);
            } catch (err) {
                this.log(`❌ Unexpected error loading Google Maps SDK: ${err.message}`);
                reject(err.message);
            }
        });
    }

    // --- GOOGLE PLACES DETAILS API ---
    /**
     * Fetch phone/website for a single place using Google Places getDetails() API
     * Uses Query.getPlaceDetailsRequest() for consistent field specification
     */
    async getPlaceDetails(placeId) {
        return new Promise((resolve) => {
            try {
                if (!window.google || !window.google.maps || !window.google.maps.places) {
                    return resolve(null);
                }

                const dummyDiv = document.createElement('div');
                const service = new google.maps.places.PlacesService(dummyDiv);
                
                // Use Query engine to format the request
                const request = this.queryEngine.getPlaceDetailsRequest(placeId);

                // Use timeout from Query engine
                const timeouts = this.queryEngine.getAPITimeouts();
                const timeout = setTimeout(() => {
                    resolve(null);
                }, timeouts.getDetails);

                service.getDetails(request, (place, status) => {
                    clearTimeout(timeout);
                    try {
                        if (status === 'OK' && place) {
                            resolve(place);
                        } else {
                            resolve(null);
                        }
                    } catch (err) {
                        resolve(null);
                    }
                });
            } catch (err) {
                resolve(null);
            }
        });
    }

    // --- GOOGLE PLACES API CALLS ---
    /**
     * Search for businesses and fetch complete details (2-step process)
     * Uses Query.getGoogleMapsRequests() for query formatting
     */
    async fetchPlacesData(query) {
        return new Promise((resolve) => {
            try {
                // Validate using Query engine
                const validation = this.queryEngine.validateAPIConfiguration();
                if (!validation.isValid) {
                    this.log(`❌ Cannot search: ${validation.errors.join(', ')}`);
                    return resolve([]);
                }

                const dummyDiv = document.createElement('div');
                const service = new google.maps.places.PlacesService(dummyDiv);
                
                // Use Query engine to format the request
                const requests = this.queryEngine.getGoogleMapsRequests();
                const matchedRequest = requests.find(req => req.raw === query);
                const formattedQuery = matchedRequest ? matchedRequest.gmapsPayload : { query: `${query} in ${this.queryEngine.location}` };

                // Text Search only returns basic info - we'll get details later
                const request = {
                    ...formattedQuery,
                    fields: ['name', 'formatted_address', 'geometry', 'place_id']
                };
        
                // Use timeout from Query engine
                const timeouts = this.queryEngine.getAPITimeouts();
                const timeout = setTimeout(() => {
                    this.log(`❌ REQUEST TIMEOUT for "${query}" (${timeouts.textSearch/1000}s)`);
                    resolve([]);
                }, timeouts.textSearch);
        
                service.textSearch(request, async (results, status) => {
                    clearTimeout(timeout);
                    
                    try {
                        this.log(`📊 Status for "${query}": ${status}`);
        
                        const statusMap = {
                            'INVALID_REQUEST': 'Invalid request - check query and location',
                            'REQUEST_DENIED': 'API key is invalid or lacks permissions',
                            'OVER_QUERY_LIMIT': 'Query limit exceeded',
                            'NOT_FOUND': 'No results found',
                            'ZERO_RESULTS': 'Zero results found',
                            'OK': null
                        };
        
                        if (statusMap[status]) {
                            this.log(`❌ Places API error: ${statusMap[status]}`);
                        } else if (status !== 'OK') {
                            this.log(`❌ Unknown Places API status: ${status}`);
                        }
        
                        if (status === 'OK' && results && results.length > 0) {
                            this.log(`✅ Found ${results.length} results for "${query}"`);
                            this.log(`🔍 Fetching detailed information for ${results.length} results...`);
                            
                            const detailedResults = [];
                            for (let result of results) {
                                const details = await this.getPlaceDetails(result.place_id);
                                if (details) {
                                    detailedResults.push(details);
                                }
                            }
                            
                            this.log(`✅ Retrieved details for ${detailedResults.length} results`);
                            resolve(detailedResults);
                        } else if (status === 'OK') {
                            this.log(`⚠️ Found 0 results for "${query}"`);
                            resolve([]);
                        } else {
                            resolve([]);
                        }
                    } catch (err) {
                        this.log(`❌ Error processing Places response: ${err.message}`);
                        resolve([]);
                    }
                });
            } catch (err) {
                this.log(`❌ Error searching for "${query}": ${err.message}`);
                resolve([]);
            }
        });
    }

    // --- GEMINI PROCESSING ---
    /**
     * Use Gemini AI to parse and format Google Places data
     * Uses Query.getGeminiPayload() for consistent payload formatting
     */
    async processLeadsWithGemini(rawPlaces) {
        try {
            if (!rawPlaces || rawPlaces.length === 0) {
                this.log('⚠️ No places to process with Gemini');
                return [];
            }

            if (!this.geminiKey || this.geminiKey === 'NOT_SET') {
                this.log('❌ Gemini API key is not configured');
                return [];
            }

            // Use Query engine to format Gemini payload
            const payload = this.queryEngine.getGeminiPayload(rawPlaces);

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiKey}`;

            // Use timeout from Query engine
            const timeouts = this.queryEngine.getAPITimeouts();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeouts.gemini);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    this.log('❌ Gemini API authentication failed - invalid API key');
                } else if (response.status === 429) {
                    this.log('❌ Gemini API rate limit exceeded');
                } else if (response.status === 400) {
                    this.log(`❌ Gemini API bad request (${response.status})`);
                } else if (response.status === 500) {
                    this.log(`❌ Gemini API server error (${response.status})`);
                } else {
                    this.log(`❌ Gemini API error: ${response.status} ${response.statusText}`);
                }
                return [];
            }

            const data = await response.json();

            // Validate response structure
            if (!data.candidates || data.candidates.length === 0) {
                this.log('❌ Gemini returned empty response');
                return [];
            }

            if (!data.candidates[0].content?.parts?.[0]?.text) {
                this.log('❌ Gemini returned malformed response');
                return [];
            }

            const textResponse = data.candidates[0].content.parts[0].text;
            
            try {
                const parsed = JSON.parse(textResponse);
                const companies = parsed.companies || [];
                this.log(`✅ Gemini processed ${companies.length} results`);
                return companies;
            } catch (parseErr) {
                this.log(`❌ Failed to parse Gemini response: ${parseErr.message}`);
                return [];
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                this.log('❌ Gemini API request timeout');
            } else {
                this.log(`❌ Gemini processing error: ${err.message}`);
            }
            return [];
        }
    }
    
    // --- Filters out duplicate business names ---
    processAndDeduplicate(allLeads) {
        const shouldFilter = document.getElementById('filterDuplicates').checked;
        
        if (!shouldFilter) return allLeads;
    
        const seen = new Map();
        
        return allLeads.filter(lead => {
            // Normalize name for comparison (remove whitespace/casing)
            const name = lead.name.toLowerCase().trim();
            
            if (seen.has(name)) {
                // Already added a branch of this business, skip this one
                return false;
            }
            
            // First time seeing this name, mark as seen
            seen.set(name, true);
            return true;
        });
    }

    // --- UI RENDERING ---
    renderTable() {
        const tbody = document.querySelector('#resultsTable tbody');
        tbody.innerHTML = '';
        
        if (this.globalLeadsCollection.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="has-text-centered">No data.</td></tr>`;
            return;
        }

        this.globalLeadsCollection.forEach(lead => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${lead.name || 'N/A'}</strong></td>
                    <td>${lead.phone || 'N/A'}</td>
                    <td>${lead.website ? `<a href="${lead.website}" target="_blank">Link</a>` : 'N/A'}</td>
                    <td><small>${lead.address || 'N/A'}</small></td>
                </tr>
            `;
        });
    }

    // --- MAIN ORCHESTRATION ---
    // Search.js -> Core Modernized Architecture Methods
    async init() {
        try {
            if (!this.queryEngine) {
                this.log('❌ Query engine failed to initialize');
                return;
            }
    
            this.log("Loading dynamic Google Maps environment...");
            await this.loadGoogleMapsSDK(); // Ensure this finishes loading
    
            // Import the new Places library dynamically from the window context
            const { Place } = await google.maps.importLibrary("places");
            
            let searchRequests = this.queryEngine.getGoogleMapsRequests();
            let totalProcessed = 0;
            let totalFailed = 0;
    
            for (let requestObj of searchRequests) {
                this.log(`Executing Text Search (New): ${requestObj.compiledQuery}`);
                
                try {
                	// Defensive array mapping to guarantee a pure, clean array primitive is passed
                	const searchArgs = {
                    	textQuery: requestObj.gmapsPayload.textQuery,
                    	fields: Array.from(requestObj.gmapsPayload.fields) 
                	};
                
                    // Execute the modern Promise-based Text Search
                	const { places } = await Place.searchByText(searchArgs);
                    
                    if (places && places.length > 0) {
                        this.log(`Found ${places.length} baseline candidates. Hydrating deep metadata...`);
                        const hydratedResults = [];
    
                        for (let placeInstance of places) {
                            try {
                                // FETCHFIELDS FIX: Changed 'website' to 'websiteURI'
                                await placeInstance.fetchFields({
                                    fields: ['displayName', 'formattedAddress', 'internationalPhoneNumber', 'websiteURI']
                                });
                        
                                // MAPPING FIX: Extract from placeInstance.websiteURI instead of placeInstance.website
                                hydratedResults.push({
                                    name: placeInstance.displayName || 'Unknown Name',
                                    address: placeInstance.formattedAddress || 'No Address available',
                                    phone: placeInstance.internationalPhoneNumber || null,
                                    // Assign websiteURI down to your pipeline
                                    website: placeInstance.websiteURI || null 
                                });
                            } catch (hydrationErr) {
                                this.log(`⚠️ Skimming place ID due to details constraint: ${hydrationErr.message}`);
                            }
                        }
    
                        // Route to Gemini
                    	if (hydratedResults.length > 0) {
                    	    this.log(`Routing ${hydratedResults.length} leads to Gemini context parser...`);
                    	    const geminiBody = this.queryEngine.getGeminiPayload(hydratedResults);
                    	    
                    	    // 1. Get raw leads from Gemini
                    	    let leads = await this.processLeadsWithGemini(geminiBody);
                    	    
                    	    // 2. APPLY FILTERING HERE: 
                    	    // This cleans the current batch against existing data in your collection
                    	    const filteredNewLeads = this.processAndDeduplicate(leads);
                    	    
                    	    // 3. Update the collection and render
                    	    this.globalLeadsCollection = this.globalLeadsCollection.concat(filteredNewLeads);
                    	    totalProcessed += filteredNewLeads.length;
                    	    this.renderTable();
                    	}
    
                    } else {
                        this.log(`⚠️ No results returned for "${requestObj.raw}"`);
                        totalFailed++;
                    }
                } catch (searchErr) {
                    this.log(`❌ Search operational failure on query "${requestObj.raw}": ${searchErr.message}`);
                    totalFailed++;
                }
            }
    
            // Summary logger logic remains the same below...
            this.log(`🏁 Operation completed. Gained ${totalProcessed} leads.`);
            
        } catch (criticalErr) {
            this.log(`❌ Critical Context Break: ${criticalErr.message}`);
        }
    }
}
