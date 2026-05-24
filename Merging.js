/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MERGING CLASS - CSV Upload, Parsing, Deduplication & Export
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE: Accepts multiple uploaded .csv lead files, parses each into a
 * normalized record array, deduplicates across all files using a composite
 * key strategy, and exposes the merged result for UI rendering and export.
 *
 * DEDUPLICATION STRATEGY:
 *   A record is considered a duplicate if it shares the same normalized
 *   company name OR the same non-empty phone number as an already-seen
 *   record. Name normalization strips punctuation, casing, and common
 *   legal suffixes (LLC, Inc, Corp, Ltd) so minor formatting differences
 *   between files do not produce false uniques.
 *
 * EXPECTED CSV SCHEMA (produced by the Lead Gen agent):
 *   Company Name, Phone, Website, Address
 *
 * METHODS:
 *   - constructor(logElementId)        - Bind to a <div> for status output
 *   - loadFiles(fileList)              - Entry point: accepts FileList from <input>
 *   - parseCSV(text)                   - Converts raw CSV string → Array<Object>
 *   - normalizeName(name)              - Canonical key for dedup comparison
 *   - mergeAndDeduplicate(allRecords)  - Core dedup logic, returns merged array
 *   - renderTable(records)             - Populates the merge results <table>
 *   - exportToCSV(records)             - Downloads merged data as a .csv file
 *   - getStats()                       - Returns last-run statistics object
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class Merging {

    /**
     * @param {string} logElementId   - ID of the <div> used as the merge console
     * @param {string} tableBodyId    - ID of the <tbody> to render merged results
     * @param {string} statsBarId     - ID of the element showing run statistics
     */
    constructor(logElementId = 'mergeConsole', tableBodyId = 'mergeTableBody', statsBarId = 'mergeStats') {
        this._logEl    = document.getElementById(logElementId);
        this._tbodyEl  = document.getElementById(tableBodyId);
        this._statsEl  = document.getElementById(statsBarId);

        // Populated after a successful merge run
        this._lastStats = {
            filesLoaded:   0,
            totalRaw:      0,
            duplicatesRemoved: 0,
            finalCount:    0
        };

        this._mergedRecords = [];
    }

    // ─── PUBLIC ENTRY POINT ──────────────────────────────────────────────────

    /**
     * Orchestrates file reading → parsing → merging → rendering.
     * Call this from the Upload button's click handler, passing event.target.files.
     * @param {FileList} fileList
     */
    async loadFiles(fileList) {
        if (!fileList || fileList.length === 0) {
            this._log('⚠️  No files selected. Please choose at least one .csv file.');
            return;
        }

        this._log(`📂 Loading ${fileList.length} file(s)...`);
        this._clearTable();

        const allRecords = [];

        for (const file of fileList) {
            if (!file.name.toLowerCase().endsWith('.csv')) {
                this._log(`⛔ Skipped "${file.name}" — not a .csv file.`);
                continue;
            }

            try {
                const text = await this._readFileAsText(file);
                const records = this.parseCSV(text);
                this._log(`✅ "${file.name}" → ${records.length} record(s) parsed.`);
                allRecords.push(...records);
            } catch (err) {
                this._log(`❌ Failed to read "${file.name}": ${err.message}`);
            }
        }

        if (allRecords.length === 0) {
            this._log('⚠️  No valid records found across all uploaded files.');
            return;
        }

        this._log(`🔄 Running deduplication across ${allRecords.length} total record(s)...`);
        const merged = this.mergeAndDeduplicate(allRecords);

        this._lastStats = {
            filesLoaded:       fileList.length,
            totalRaw:          allRecords.length,
            duplicatesRemoved: allRecords.length - merged.length,
            finalCount:        merged.length
        };

        this._mergedRecords = merged;
        this._renderTable(merged);
        this._renderStats();

        this._log(`🏁 Done. ${merged.length} unique leads compiled. ${this._lastStats.duplicatesRemoved} duplicate(s) removed.`);
    }

    // ─── CSV PARSING ─────────────────────────────────────────────────────────

    /**
     * Converts a raw CSV string into an array of normalized record objects.
     * Handles quoted fields that may contain commas or newlines.
     * @param {string} csvText
     * @returns {Array<Object>} Array of { name, phone, website, address }
     */
    parseCSV(csvText) {
        const lines = this._splitCSVLines(csvText.trim());

        if (lines.length < 2) return []; // Header-only or empty

        // Detect and skip the header row regardless of capitalisation
        const header = lines[0].map(h => h.toLowerCase().trim());
        const nameIdx    = this._findColumn(header, ['company name', 'name', 'company']);
        const phoneIdx   = this._findColumn(header, ['phone', 'phone number', 'telephone', 'tel']);
        const websiteIdx = this._findColumn(header, ['website', 'url', 'web', 'site']);
        const addrIdx    = this._findColumn(header, ['address', 'formatted address', 'location']);

        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i];
            if (cols.every(c => c.trim() === '')) continue; // Skip blank rows

            const record = {
                name:    nameIdx    >= 0 ? cols[nameIdx]?.trim()    || '' : '',
                phone:   phoneIdx   >= 0 ? cols[phoneIdx]?.trim()   || '' : '',
                website: websiteIdx >= 0 ? cols[websiteIdx]?.trim() || '' : '',
                address: addrIdx    >= 0 ? cols[addrIdx]?.trim()    || '' : ''
            };

            // Discard rows with no company name at all
            if (record.name !== '') {
                records.push(record);
            }
        }

        return records;
    }

    // ─── DEDUPLICATION ───────────────────────────────────────────────────────

    /**
     * Merges an array of records (from multiple files) into a deduplicated list.
     * Two records are considered duplicates if they share:
     *   (a) the same normalized company name, OR
     *   (b) the same non-empty phone number
     * @param {Array<Object>} allRecords
     * @returns {Array<Object>} Deduplicated records
     */
    mergeAndDeduplicate(allRecords) {
        const seenNames  = new Set();
        const seenPhones = new Set();
        const unique     = [];

        for (const record of allRecords) {
            const normName  = this.normalizeName(record.name);
            const normPhone = record.phone.replace(/\D/g, ''); // digits only

            // Check for name collision
            if (normName && seenNames.has(normName)) continue;

            // Check for phone collision (only meaningful for real phone strings)
            if (normPhone.length >= 7 && seenPhones.has(normPhone)) continue;

            // This record is unique — register its keys and keep it
            if (normName)           seenNames.add(normName);
            if (normPhone.length >= 7) seenPhones.add(normPhone);

            unique.push(record);
        }

        return unique;
    }

    /**
     * Produces a canonical string key for company name comparison.
     * Strips punctuation, common legal suffixes, extra whitespace, and lowercases.
     * @param {string} name
     * @returns {string}
     */
    normalizeName(name) {
        if (!name) return '';

        return name
            .toLowerCase()
            // Remove common legal entity suffixes
            .replace(/\b(llc|inc|corp|ltd|co|company|group|holdings|associates|partners|solutions|services|technologies|consulting)\b\.?/gi, '')
            // Strip punctuation except spaces
            .replace(/[^a-z0-9\s]/g, '')
            // Collapse whitespace
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ─── EXPORT ──────────────────────────────────────────────────────────────

    /**
     * Triggers a browser download of the merged leads as a .csv file.
     * Uses the same export format as the main agent's exportInstanceToCSV().
     * @param {Array<Object>} records - Defaults to last merged result
     */
    exportToCSV(records = this._mergedRecords) {
        if (!records || records.length === 0) {
            this._log('⚠️  Nothing to export — merge results are empty.');
            return;
        }

        const userInput = prompt('Enter a filename for the merged export:', 'merged_leads.csv');
        if (userInput === null) return;

        const fileName = userInput.endsWith('.csv') ? userInput : `${userInput}.csv`;

        let csv = 'Company Name,Phone,Website,Address\n';

        records.forEach(r => {
            csv += [
                `"${(r.name    || '').replace(/"/g, '""')}"`,
                `"${(r.phone   || '')}"`,
                `"${(r.website || '')}"`,
                `"${(r.address || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this._log(`💾 Exported "${fileName}" with ${records.length} record(s).`);
    }

    // ─── STATS ───────────────────────────────────────────────────────────────

    /**
     * Returns statistics from the most recent merge run.
     * @returns {Object} { filesLoaded, totalRaw, duplicatesRemoved, finalCount }
     */
    getStats() {
        return { ...this._lastStats };
    }

    // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────

    /**
     * Reads a File object as a UTF-8 string via FileReader.
     * @param {File} file
     * @returns {Promise<string>}
     */
    _readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsText(file, 'utf-8');
        });
    }

    /**
     * Splits raw CSV text into a 2D array of [row][col] strings.
     * Correctly handles quoted fields containing commas and newlines.
     * @param {string} text
     * @returns {Array<Array<string>>}
     */
    _splitCSVLines(text) {
        const rows = [];
        let col = '', row = [], inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const ch   = text[i];
            const next = text[i + 1];

            if (inQuotes) {
                if (ch === '"' && next === '"') { col += '"'; i++; }          // Escaped quote
                else if (ch === '"')             { inQuotes = false; }         // End of quoted field
                else                             { col += ch; }
            } else {
                if      (ch === '"')  { inQuotes = true; }
                else if (ch === ',')  { row.push(col); col = ''; }
                else if (ch === '\n') { row.push(col); rows.push(row); row = []; col = ''; }
                else if (ch === '\r') { /* skip carriage returns */ }
                else                  { col += ch; }
            }
        }

        // Flush last field and row
        row.push(col);
        if (row.some(c => c !== '')) rows.push(row);

        return rows;
    }

    /**
     * Finds the index of a column given a list of candidate header names.
     * @param {Array<string>} headerRow - Lowercased header array
     * @param {Array<string>} candidates - Possible column names in priority order
     * @returns {number} Column index or -1 if not found
     */
    _findColumn(headerRow, candidates) {
        for (const candidate of candidates) {
            const idx = headerRow.indexOf(candidate);
            if (idx >= 0) return idx;
        }
        return -1;
    }

    /**
     * Appends a timestamped message to the merge console element.
     * @param {string} message
     */
    _log(message) {
        if (!this._logEl) { console.log(message); return; }
        const ts   = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.textContent = `[${ts}] ${message}`;
        this._logEl.appendChild(line);
        this._logEl.scrollTop = this._logEl.scrollHeight;
    }

    /**
     * Empties the results table and resets the stats bar.
     */
    _clearTable() {
        if (this._tbodyEl) {
            this._tbodyEl.innerHTML =
                '<tr><td colspan="4" class="has-text-centered has-text-grey-light">Processing...</td></tr>';
        }
        if (this._statsEl) this._statsEl.textContent = '';
    }

    /**
     * Populates the merge results table with deduplicated records.
     * @param {Array<Object>} records
     */
    _renderTable(records) {
        if (!this._tbodyEl) return;

        if (records.length === 0) {
            this._tbodyEl.innerHTML =
                '<tr><td colspan="4" class="has-text-centered has-text-grey-light">No unique records found.</td></tr>';
            return;
        }

        this._tbodyEl.innerHTML = records.map(r => `
            <tr>
                <td>${this._esc(r.name)}</td>
                <td>${this._esc(r.phone)}</td>
                <td>${r.website
                    ? `<a href="${this._esc(r.website)}" target="_blank" rel="noopener">${this._esc(r.website)}</a>`
                    : '—'}</td>
                <td>${this._esc(r.address)}</td>
            </tr>`
        ).join('');
    }

    /**
     * Writes the run statistics into the stats bar element.
     */
    _renderStats() {
        if (!this._statsEl) return;
        const s = this._lastStats;
        this._statsEl.innerHTML =
            `<span class="tag is-dark mr-2">Files: ${s.filesLoaded}</span>` +
            `<span class="tag is-info mr-2">Raw Records: ${s.totalRaw}</span>` +
            `<span class="tag is-warning mr-2">Duplicates Removed: ${s.duplicatesRemoved}</span>` +
            `<span class="tag is-success">Unique Leads: ${s.finalCount}</span>`;
    }

    /**
     * HTML-escapes a string to prevent XSS when inserting into innerHTML.
     * @param {string} str
     * @returns {string}
     */
    _esc(str) {
        return (str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
