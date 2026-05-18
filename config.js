// Configuration file for API keys
// Safely handles both development (without Vite) and production (with Vite)

// Safely access import.meta.env - it may not exist in development
function getEnvVariable(variableName) {
    try {
        // In Vite production builds
        if (import.meta && import.meta.env) {
            return import.meta.env[variableName];
        }
    } catch (e) {
        // import.meta not available
    }

    // Fallback: check globalThis
    try {
        if (globalThis && globalThis.__ENV__ && globalThis.__ENV__[variableName]) {
            return globalThis.__ENV__[variableName];
        }
    } catch (e) {
        // ignore
    }

    return undefined;
}

export const config = {
    // Paste your raw API key strings directly as the values
    GOOGLE_MAPS_API_KEY: 'REPLACE_WITH_YOUR_PLACES_API',
    GEMINI_API_KEY: 'REPLACE_WITH_YOUR_GEMINI_API'
};

// Validate that keys are set (this will be caught by Search.js validateApiKeys)
if (config.GOOGLE_MAPS_API_KEY === 'NOT_SET') {
    console.warn('⚠️ VITE_GOOGLE_MAPS_API_KEY is not set - check config.js or .env.local');
}
if (config.GEMINI_API_KEY === 'NOT_SET') {
    console.warn('⚠️ VITE_GEMINI_API_KEY is not set - check config.js or .env.local');
}

