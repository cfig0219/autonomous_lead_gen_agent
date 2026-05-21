# 🗺️ Autonomous Lead Generation Agent

An intelligent web application that searches for businesses using Google Places API and formats results using Gemini AI. Find and compile detailed business information (name, phone, website, address) from any location and search category.

---

## 📋 Requirements

Before running this program, you must have:

### 1. **Python 3.x** (for local development server)
   - Download from [python.org](https://www.python.org/downloads/)
   - Verify installation: `python3 --version`

### 2. **Google Places API Key**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable: **Google Places API**, **Maps JavaScript API**, and **Geocoding API**
   - Create an API key under Credentials
   - Copy the key for use in `config.js`

### 3. **Gemini API Key**
   - Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Click "Get API key"
   - Copy the key for use in `config.js`

### 4. **A Modern Web Browser**
   - Chrome, Firefox, Safari, or Edge (ES6 module support required)

---

## 🚀 Getting Started

### Step 1: Clone or Download This Repository
```bash
git clone https://github.com/YOUR_USERNAME/maps-lead-gen.git
cd maps-lead-gen
```

### Step 2: Configure Your API Keys
Edit `config.js` and replace the placeholder values:
```javascript
export const config = {
    GOOGLE_MAPS_API_KEY: 'YOUR_ACTUAL_GOOGLE_PLACES_API_KEY_HERE',
    GEMINI_API_KEY: 'YOUR_ACTUAL_GEMINI_API_KEY_HERE'
};
```

### Step 3: Start the Local Development Server
Open a terminal in the project directory and run:
```bash
python3 -m http.server 8888
```

You should see:
```
Serving HTTP on 0.0.0.0 port 8888 (http://0.0.0.0:8888/) ...
```

### Step 4: Access the Application
Open your web browser and navigate to:
```
http://localhost:8888/index.html
```

You should see the Autonomous Lead Gen Agent interface.

---

## 📁 File Structure & Roles

### **1. `index.html`** - User Interface & Entry Point
**Role:** The frontend interface that collects user input and displays results

**What it does:**
- Provides input fields for location (zip code) and search queries
- Displays a real-time execution log (green terminal-style console)
- Shows results in an interactive HTML table
- Enables CSV export of compiled leads

---

### **2. `Search.js`** - Orchestration & API Coordination
**Role:** Main orchestration engine that validates input and coordinates all API calls

**What it does:**
- Validates API keys are configured
- Loads Google Maps SDK
- Makes calls to Google Places API (text search + getDetails)
- Sends data to Gemini API for intelligent parsing
- Accumulates results and updates the UI table
- Handles all errors gracefully (never crashes)

**Data Validation:**
- Checks API keys are configured (not 'NOT_SET')
- Verifies location and queries are provided
- Validates Google Maps SDK loaded successfully
- Continues processing even if one query fails

---

### **3. `Query.js`** - Query Formatting & API Configuration
**Role:** Handles all query formatting and provides centralized API configuration

**What it does:**
- Formats user queries into Google Places API request format
- Provides consistent request formatting for all APIs
- Validates API prerequisites (location, queries, SDK)
- Centralizes timeout values for all API calls
- Generates Gemini prompts and JSON schemas

---

### **4. `config.js`** - API Keys & Configuration
**Role:** Stores API keys and secrets (user must configure)

**What it contains:**
```javascript
export const config = {
    GOOGLE_MAPS_API_KEY: 'YOUR_KEY_HERE',
    GEMINI_API_KEY: 'YOUR_KEY_HERE'
};
```

**⚠️ IMPORTANT:**
- **Never commit actual API keys to GitHub**
- Use `.gitignore` to exclude `config.js` if storing real keys
- For production, use GitHub Secrets + GitHub Actions
- For development, edit locally and keep out of version control

---

## 🔄 Typical Workflow

1. **User enters:**
   - Location: `10025` (NYC zip code)
   - Queries: `aerospace companies` and `systems integrators`

2. **Search.js validates:**
   - ✅ API keys configured
   - ✅ Location provided
   - ✅ Queries provided
   - ✅ Google Maps SDK loaded

3. **For "aerospace companies":**
   - Calls Google Places textSearch("aerospace companies in 10025")
   - Gets 10 results with place_ids
   - For each place_id, calls getDetails() to fetch phone/website
   - Sends complete data to Gemini
   - Gemini returns formatted JSON with only complete records
   - Adds to results table

4. **For "systems integrators":**
   - Repeats same process
   - Accumulates additional results

5. **User sees:**
   - Real-time execution log showing progress
   - Results table populated with businesses
   - "Export to CSV" button enabled

6. **User downloads:**
   - CSV file with all compiled leads

---

## 📈 How Results Are Filtered

The system returns only businesses with **BOTH phone and website** because:

1. **Google Places textSearch** returns basic info (name, address)
2. **getDetails** fetches complete info (phone, website)
3. **Gemini** parses and filters: returns only records with both fields
4. **Result:** High-quality leads with complete contact information

---

## 🔐 Security Notes

- **Never commit API keys** to GitHub
- Use `.gitignore` to exclude `config.js` with real keys
- For production deployment, use environment variables or GitHub Secrets
- Keep API keys private - they can be abused if exposed

---

## 👤 Author
**Christopher J. Figueroa**
* **Education:** MS in Computer Science | SUNY Polytechnic Institute
* **Specialization:** Agentic AI, Machine Learning, and Multi-Agent Systems
* **Technical Profile:** Specialist in developing multi-agent systems using `PydanticAI` and `LangGraph`.
* **Contact:** [LinkedIn](https://www.linkedin.com/in/christopher-figueroa-812aa1186/) | [GitHub](https://github.com/cfig0219?tab=repositories)
