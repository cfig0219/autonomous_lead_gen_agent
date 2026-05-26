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
 * processLeadsWithGemini(rawPlaces)
 *   └─ Format data with Gemini AI using JSON schema
 * 
 * renderTable()
 *   └─ Display results in HTML table
 * 
 * init()
 *   └─ Main orchestration loop: validate → load SDK → search → filter → process → display
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

                const script = document.createElement('script');
                script.src = `https://maps.googleapis.com/maps/api/js?key=${this.gmapsKey}&libraries=places`;
                
                // Use timeout from Query engine
                const timeouts = this.queryEngine?.getAPITimeouts() || { textSearch: 10000 };
                const timeout = setTimeout(() => {
                    this.log('❌ Google Maps SDK load timeout (10 seconds)');
                    reject('Google Maps SDK load timeout');
                }, timeouts.textSearch);

                script.onload = () => {
                    clearTimeout(timeout);
                    try {
                        if (!window.google || !window.google.maps) {
                            throw new Error('Google Maps object not found after SDK loaded');
                        }
                        this.log('✅ Google Maps SDK loaded successfully');
                        resolve();
                    } catch (err) {
                        this.log(`❌ Google Maps validation error: ${err.message}`);
                        reject(err.message);
                    }
                };

                script.onerror = () => {
                    clearTimeout(timeout);
                    this.log('❌ Failed to load Google Maps SDK. Check that:');
                    this.log('   - API key is valid');
                    this.log('   - Google Maps API is enabled in Google Cloud Console');
                    this.log('   - Places API is enabled in Google Cloud Console');
                    reject('Failed to load Google Maps SDK');
                };

                document.head.appendChild(script);
            } catch (err) {
                this.log(`❌ Unexpected error loading Google Maps SDK: ${err.message}`);
                reject(err.message);
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

    // --- DEDUPLICATION & FILTERING ---
        processAndDeduplicate(newLeads) {
            const shouldFilter = document.getElementById('filterDuplicates').checked;
            if (!shouldFilter) return newLeads;
        
            // 1. Seed our trackers with whatever is already saved historically
            const existingAddresses = new Set(
                this.globalLeadsCollection.map(lead => {
                    const addr = lead.address || lead.Address || lead.companyAddress || lead.formattedAddress || '';
                    return addr.toLowerCase().trim();
                }).filter(Boolean)
            );
            
            const existingNames = new Set(
                this.globalLeadsCollection.map(lead => {
                    const name = lead.name || lead.Name || lead.companyName || lead['Company Name'] || '';
                    return name.toLowerCase().trim();
                }).filter(Boolean)
            );
        
            // 2. Filter the incoming loop, updating our tracking sets as we go
            return newLeads.filter(lead => {
                const rawName = lead.name || lead.Name || lead.companyName || lead['Company Name'] || '';
                const rawAddress = lead.address || lead.Address || lead.companyAddress || lead.formattedAddress || '';
    
                const cleanName = rawName.toLowerCase().trim();
                const cleanAddress = rawAddress.toLowerCase().trim();
        
                if (!cleanName && !cleanAddress) return true;
    
                // Check against historical database AND current loop's discovered duplicates
                if (cleanName && existingNames.has(cleanName)) {
                    return false; 
                }
                if (cleanAddress && existingAddresses.has(cleanAddress)) {
                    return false;
                }
        
                // Add to tracking sets immediately so the next item in this exact batch can check against it
                if (cleanName) existingNames.add(cleanName);
                if (cleanAddress) existingAddresses.add(cleanAddress);
                
                return true;
            });
        }

    // --- UI RENDERING ---
        renderTable() {
            const tbody = document.querySelector('#resultsTable tbody');
            if (!tbody) return;
            
            // 🚨 CRITICAL FIX: Clear out the table body first so we don't duplicate rows on subsequent query loops
            tbody.innerHTML = '';
            
            if (this.globalLeadsCollection.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="has-text-centered">No data.</td></tr>`;
                return;
            }
    
            this.globalLeadsCollection.forEach(lead => {
                // Safely map keys regardless of casing from Gemini
                const name = lead.name || lead.Name || lead.companyName || lead['Company Name'] || 'N/A';
                const phone = lead.phone || lead.Phone || lead.phoneNumber || 'N/A';
                const website = lead.website || lead.Website || lead.websiteURI || null;
                const address = lead.address || lead.Address || lead.formattedAddress || 'N/A';
    
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${name}</strong></td>
                        <td>${phone}</td>
                        <td>${website ? `<a href="${website}" target="_blank">Link</a>` : 'N/A'}</td>
                        <td><small>${address}</small></td>
                    </tr>
                `;
            });
        }

    // --- MAIN ORCHESTRATION ---
    async init() {
        try {
            if (!this.queryEngine) {
                this.log('❌ Query engine failed to initialize');
                return;
            }
    
            this.log("Loading dynamic Google Maps environment...");
            await this.loadGoogleMapsSDK();
    
            // ════════════════════════════════════════════════════════════════
            // NEW: Get coordinates of central location for distance filtering
            // ════════════════════════════════════════════════════════════════
            let centerCoordinates = null;
            try {
                this.log("🔍 Geocoding central location for distance filtering...");
                centerCoordinates = await this.queryEngine.getLocationCoordinates(this.queryEngine.location);
                this.log(`✅ Central location: ${centerCoordinates.formattedAddress}`);
                this.log(`   Coordinates: ${centerCoordinates.lat.toFixed(4)}, ${centerCoordinates.lng.toFixed(4)}`);
            } catch (geoErr) {
                this.log(`⚠️ Could not geocode location: ${geoErr}`);
                this.log('⚠️ Distance filtering disabled - using all results');
                centerCoordinates = null;
            }
    
            // Import the new Places library
            const { Place } = await google.maps.importLibrary("places");
            
            let searchRequests = this.queryEngine.getGoogleMapsRequests();
            let totalProcessed = 0;
            let totalFailed = 0;
            let totalFiltered = 0; // NEW: Track filtered results
    
            for (let requestObj of searchRequests) {
                this.log(`Executing Text Search: ${requestObj.compiledQuery}`);
                
                try {
                	const searchArgs = {
                    	textQuery: requestObj.gmapsPayload.textQuery,
                    	fields: Array.from(requestObj.gmapsPayload.fields) 
                	};
                
                	const { places } = await Place.searchByText(searchArgs);
                    
                    if (places && places.length > 0) {
                        this.log(`✅ Found ${places.length} baseline candidates. Hydrating deep metadata...`);
                        let hydratedResults = [];
    
                        for (let placeInstance of places) {
                            try {
                                // Fetch fields including location for distance calculation
                                await placeInstance.fetchFields({
                                    fields: [
                                        'displayName',
                                        'formattedAddress',
                                        'internationalPhoneNumber',
                                        'websiteURI',
                                        'location'  // NEW: Include location for distance filtering
                                    ]
                                });
                        
                                hydratedResults.push({
                                    name: placeInstance.displayName || 'Unknown Name',
                                    address: placeInstance.formattedAddress || 'No Address available',
                                    phone: placeInstance.internationalPhoneNumber || null,
                                    website: placeInstance.websiteURI || null,
                                    geometry: {
                                        location: placeInstance.location  // Store location for filtering
                                    }
                                });
                            } catch (hydrationErr) {
                                this.log(`⚠️ Skipping place due to detail constraint: ${hydrationErr.message}`);
                            }
                        }

                        // ════════════════════════════════════════════════════════════════
                        // NEW: Apply distance filtering if coordinates are available
                        // ════════════════════════════════════════════════════════════════
                        if (centerCoordinates && hydratedResults.length > 0) {
                            const maxDistance = this.queryEngine.getMaxDistanceThreshold();
                            this.log(`🔎 Filtering results to ${maxDistance}km radius...`);
                            
                            const filterResult = this.queryEngine.filterPlacesByDistance(
                                hydratedResults,
                                centerCoordinates.lat,
                                centerCoordinates.lng,
                                maxDistance
                            );
                            
                            hydratedResults = filterResult.filtered;
                            totalFiltered += filterResult.removed.length;
                            
                            if (filterResult.removed.length > 0) {
                                this.log(`🗑️ Filtered out ${filterResult.removed.length} results outside radius:`);
                                filterResult.removed.slice(0, 5).forEach(r => {
                                    this.log(`   ❌ ${r.name}: ${r.distance.toFixed(2)}km away`);
                                });
                                if (filterResult.removed.length > 5) {
                                    this.log(`   ... and ${filterResult.removed.length - 5} more`);
                                }
                            } else {
                                this.log(`✅ All results within ${maxDistance}km radius`);
                            }
                        }
    
                        // Route to Gemini
                    	if (hydratedResults.length > 0) {
                    	    this.log(`Routing ${hydratedResults.length} leads to Gemini...`);
                    	    
                    	    let leads = await this.processLeadsWithGemini(hydratedResults);
                    	    const filteredNewLeads = this.processAndDeduplicate(leads);
                    	    
                    	    this.globalLeadsCollection = this.globalLeadsCollection.concat(filteredNewLeads);
                    	    totalProcessed += filteredNewLeads.length;
                    	    this.renderTable();
                    	} else if (centerCoordinates) {
                    	    this.log(`⚠️ No results within ${this.queryEngine.getMaxDistanceThreshold()}km of "${requestObj.raw}"`);
                    	    totalFailed++;
                    	} else {
                    	    this.log(`⚠️ No results returned for "${requestObj.raw}"`);
                    	    totalFailed++;
                    	}
    
                    } else {
                        this.log(`⚠️ No results returned for "${requestObj.raw}"`);
                        totalFailed++;
                    }
                } catch (searchErr) {
                    this.log(`❌ Search error on "${requestObj.raw}": ${searchErr.message}`);
                    totalFailed++;
                }
            }
    
            // Summary with distance filtering info
            this.log(`🏁 Operation completed. Gained ${totalProcessed} leads.`);
            if (totalFiltered > 0) {
                this.log(`📊 Filtered out ${totalFiltered} results outside ${this.queryEngine.getMaxDistanceThreshold()}km radius`);
            }
            
        } catch (criticalErr) {
            this.log(`❌ Critical error: ${criticalErr.message}`);
        }
    }
}