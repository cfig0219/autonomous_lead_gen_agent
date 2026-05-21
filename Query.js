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
 * - calculateDistance() - Calculate distance between two coordinates (Haversine)
 * - filterPlacesByDistance() - Filter results by distance radius
 * - getLocationCoordinates() - Convert zip code to lat/lng
 * - getMaxDistanceThreshold() - Get max distance setting
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

    // --- DISTANCE FILTERING ---
    /**
     * Calculate distance between two geographic coordinates using Haversine formula
     * Accurate for Earth's curvature
     * @param {number} lat1 - Latitude of first point
     * @param {number} lng1 - Longitude of first point
     * @param {number} lat2 - Latitude of second point
     * @param {number} lng2 - Longitude of second point
     * @returns {number} Distance in kilometers
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        return distance;
    }

    /**
     * Filter place results by distance from central location
     * Removes any places more than maxDistanceKm away from center
     * @param {Array} places - Array of place objects from Google Places API
     * @param {number} centerLat - Latitude of central location (zip code center)
     * @param {number} centerLng - Longitude of central location (zip code center)
     * @param {number} maxDistanceKm - Maximum allowed distance in kilometers (default: 80)
     * @returns {Object} { filtered: [places], removed: [places], distances: {place_id: distance} }
     */
    filterPlacesByDistance(places, centerLat, centerLng, maxDistanceKm = 80) {
        if (!places || places.length === 0) {
            return { filtered: [], removed: [], distances: {} };
        }

        if (!centerLat || !centerLng) {
            throw new Error("Center latitude and longitude are required for distance filtering");
        }

        const filtered = [];
        const removed = [];
        const distances = {};

        places.forEach(place => {
            // Get coordinates from place object
            let lat, lng;

            if (place.geometry && place.geometry.location) {
                if (typeof place.geometry.location.lat === 'function') {
                    // Old API format: lat() and lng() are functions
                    lat = place.geometry.location.lat();
                    lng = place.geometry.location.lng();
                } else if (place.geometry.location.lat !== undefined) {
                    // New format: lat and lng are properties
                    lat = place.geometry.location.lat;
                    lng = place.geometry.location.lng;
                }
            }

            // If no geometry, try location property (for new Places library)
            if (!lat || !lng) {
                if (place.location) {
                    lat = place.location.latitude;
                    lng = place.location.longitude;
                }
            }

            // If still no coordinates, skip this place
            if (!lat || !lng) {
                // No geometry data - include anyway (can't filter)
                filtered.push(place);
                distances[place.name || 'Unknown'] = 'N/A';
                return;
            }

            // Calculate distance
            const distance = this.calculateDistance(centerLat, centerLng, lat, lng);
            distances[place.name || 'Unknown'] = distance.toFixed(2);

            // Filter based on max distance
            if (distance <= maxDistanceKm) {
                // Keep a reference to the distance for UI display
                place.distanceFromCenter = distance;
                filtered.push(place);
            } else {
                // Track removed places for logging
                removed.push({
                    name: place.name || 'Unknown',
                    distance: distance,
                    reason: `Outside ${maxDistanceKm}km radius`
                });
            }
        });

        return {
            filtered: filtered,
            removed: removed,
            distances: distances
        };
    }

    /**
     * Get the geographic center coordinates of a given location
     * Uses Google Geocoder to convert zip code to coordinates
     * @param {string} location - Zip code or location string
     * @returns {Promise<Object>} { lat: number, lng: number, formattedAddress: string }
     */
    async getLocationCoordinates(location) {
        return new Promise((resolve, reject) => {
            try {
                if (!window.google || !window.google.maps) {
                    reject('Google Maps not loaded');
                    return;
                }

                const geocoder = new google.maps.Geocoder();
                
                geocoder.geocode({ address: location }, (results, status) => {
                    if (status === 'OK' && results && results.length > 0) {
                        const locObj = results[0].geometry.location;
                        const lat = typeof locObj.lat === 'function' ? locObj.lat() : locObj.lat;
                        const lng = typeof locObj.lng === 'function' ? locObj.lng() : locObj.lng;
                        
                        resolve({
                            lat: lat,
                            lng: lng,
                            formattedAddress: results[0].formatted_address
                        });
                    } else {
                        reject(`Geocoding failed for "${location}": ${status}`);
                    }
                });
            } catch (err) {
                reject(`Error geocoding location: ${err.message}`);
            }
        });
    }

    /**
     * Get the maximum distance threshold for filtering
     * Centralized configuration - easy to modify
     * @returns {number} Maximum distance in kilometers
     */
    getMaxDistanceThreshold() {
        return 80; // kilometers - CHANGE THIS VALUE TO ADJUST RADIUS
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