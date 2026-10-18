# Engine Data Master

# Build an Engine Test Data Comparison & Cyclic Report Generator

Build a professional, fully functional web application for engine calibration and emission testing engineers. The application must have two independent main modules:

1. Excel Data Comparison & Presentation
2. PDF Cyclic Emission Summary & Report Generation

The application is intended for engineering use. Prioritize accurate data processing, interactive graphs, reliable Excel parsing, professional report layouts, and easy meeting presentations.

## 1. Application Dashboard

Create a clean engineering dashboard with two prominent modules.

**Module A: Excel Data Comparison**
- Compare multiple engine test datasets.
- Support FTP, NRTC, NRSC, and RMC.
- Support Triggered Data and 1 Hz Data.
- Generate interactive graphs.
- Include Preview / Presentation Mode.

**Module B: PDF Cyclic Summary**
- Support NRTC, NRSC, and RMC only.
- Upload emission report PDFs.
- Extract cyclic emission results.
- Generate a formatted summary table.
- Create an editable report front page.
- Export complete reports to PDF and Word (.docx).

Do not create a master summary sheet, automatic folder scanning, or continuous monitoring functionality.

## 2. Module A — Excel Data Comparison

### Step 1: Select test cycle

Provide selectable options:
- FTP
- NRTC
- NRSC
- RMC

### Step 2: Select data type

Provide two options:

**A. Triggered Data**
- Upload Excel files containing triggered or mode-wise results.
- Compare corresponding trigger points or operating modes.
- Support datasets containing different numbers of rows.
- Allow the engineer to identify the correct trigger or mode column.

**B. 1 Hz Data**
- Upload Excel files containing time-series measurements.
- Preserve the original sample sequence and timestamps.
- Support transient datasets such as NRTC with approximately 1,236 samples.
- Do not remove, average, resample, or reorder rows by default.
- Warn about missing timestamps, duplicate timestamps, missing samples, or incompatible data.

FTP must support the same data-type selection workflow when the uploaded files contain the relevant data.

### Step 3: Upload Excel files

Support .xlsx, .xlsm, and CSV files. Support .xls where practical.

Allow the user to:
- Upload two or more datasets.
- Give each dataset a custom display name.
- Replace any uploaded file with a newer version.
- Remove a dataset.
- Preview the imported data before plotting.
- Select the worksheet when an Excel workbook has multiple sheets.
- Choose the header row if headers are not on the first row.

Automatically read column headers and populate the parameter selector from the uploaded data.

Do not hardcode a fixed list of engine parameters.

### Step 4: Configure graphs

Provide the following controls:
- X-axis parameter selector.
- Y-axis parameter selector with multi-select.
- Dataset selection.
- Graph title and subtitle.
- Axis titles and units.
- Legend position.
- Line color, line width, and line style.
- Show or hide individual datasets.
- Show or hide individual parameters.
- Zoom, pan, reset zoom, and hover tooltips.
- Select a specific time range or trigger range.
- Download graph as PNG.
- Export plotted data to Excel or CSV.

Use interactive Plotly charts or an equivalent charting library.

Support line graphs as the primary graph type. Also offer scatter plots when useful.

### Step 5: Parameter comparison

Allow the user to compare the same parameter across multiple datasets.

Examples:
- Engine Speed
- Torque
- Power
- Fuel Consumption
- Air Flow
- Boost Pressure
- EGR
- NOx
- Exhaust Temperature
- Soot
- Other parameters detected in the uploaded headers

These are examples only. The software must use actual uploaded headers.

Do not automatically compare unrelated parameters. Warn if selected parameters have different units or incompatible meanings.

For triggered data, allow comparison by matching trigger or mode identifiers.

For 1 Hz data, use the selected time or X-axis column. If timestamps differ between files, preserve the original data and clearly indicate the alignment method. Never silently align unrelated samples by row number.

### Step 6: Difference analysis

Provide optional comparison tools:
- Absolute difference between datasets.
- Percentage deviation.
- Overlay graph and difference graph.
- Min, max, mean, and standard deviation.
- Optional reference dataset selection.

Handle zero reference values safely when calculating percentage deviation. Display unavailable calculations rather than misleading results.

Do not treat different units as directly comparable without an appropriate, explicitly selected conversion.

## 3. Module A — Presentation Mode

This is a core feature.

Add a prominent button named **Preview / Presentation Mode**.

When clicked, open a clean, meeting-ready view with:
- Large readable graphs.
- Minimal interface clutter.
- Clear graph titles and axis labels.
- Visible legends.
- Optional full-screen display.
- Next graph and previous graph navigation.
- A graph selector for moving between configured graphs.
- Optional display of the selected test cycle and dataset names.

The user must be able to prepare multiple graphs and move through them during a technical meeting.

### Live Excel replacement

Provide a Replace Excel File action for each dataset.

When the user replaces an Excel file:
1. Read and validate the replacement file.
2. Detect its headers and available parameters.
3. Refresh the corresponding graph using the replacement data.
4. Preserve compatible graph settings, titles, axis selections, colors, and legend names.
5. If the selected parameter no longer exists, display a warning and ask the user to select a replacement.
6. If validation fails, retain the previous valid dataset and graph.
7. Show a visible indication of which dataset version is currently displayed.

Refresh the graph immediately after the replacement file has been successfully processed.

Do not require the user to rebuild the graph manually.

Allow the user to edit graph titles, axis labels, legend names, colors, line styles, and displayed datasets before or during a presentation.

Do not claim to modify an external PowerPoint presentation automatically. This feature updates the application's own graphs and presentation view.

Allow export of the prepared graphs for use in PowerPoint.

## 4. Editable Front Pages

Every generated report must have an editable front page.

The date field must appear on every front page and must always be editable. Default to the current date, but allow the user to enter the actual test date.

Keep the front-page details separate for each report. Do not silently carry over details from another report.

### FTP Front Page — Strict Requirement

When FTP is selected in the Excel comparison module, the front page must contain only these three fields:

1. Date
2. Engine Model
3. FTP File Name

All three fields must be editable.

Do not add additional metadata fields to the FTP front page.

Use a clean, professional engineering-document design suitable for printing and technical presentations.

### NRTC, NRSC, and RMC Front Pages

For these cycles, provide an editable front page with configurable fields, including:
- Date
- Engine Model
- Engine Number
- Test Cycle
- Test ID
- Test Name
- Project Name
- Test File Name
- Prepared By
- Additional user-defined fields

Allow the user to edit field labels and values where appropriate, hide optional fields, and add a company logo.

The front page for the PDF Cyclic Summary module must follow the same editable-date principle.

The FTP-only three-field restriction applies specifically to the FTP Excel comparison front page.

## 5. Module B — PDF Cyclic Emission Summary

This module is completely separate from the Excel comparison module.

Support these cycles only:
- NRTC
- NRSC
- RMC

Do not offer FTP in the PDF Cyclic Summary module.

### PDF workflow

1. Select NRTC, NRSC, or RMC.
2. Upload one or more PDF emission test reports.
3. Extract the relevant cyclic emission results.
4. Display the extracted values in a reviewable table.
5. Allow the user to correct extracted values and metadata.
6. Generate the editable front page.
7. Preview the complete report.
8. Export the report to PDF or Word (.docx).

Use the existing Python extraction logic supplied by the user as the starting reference. Extend it to support the required report formats rather than assuming one PDF layout works for every cycle.

The existing extraction code searches for the section containing "Emission limits - Stage V NRE" and extracts available CO, NOx, PM, PN, and remarks. Preserve the useful logic, but improve the extraction and validation workflow.

Support text-based PDFs. If a PDF is scanned or does not contain extractable text, show a clear message and provide OCR as an additional processing option if implemented.

### Cyclic summary table

Design a professional summary table based on the user's reference images.

Include relevant columns when the source report provides them, such as:
- Serial Number
- Date
- Test ID
- Test Name
- Engine Model or Engine Number
- NOx+THC
- NOx
- THC or HC
- CO
- PM
- PN
- Applicable emission limits or engineering targets
- Pass/Fail result
- Remarks

The exact columns must be configurable to suit the report type.

Do not invent missing results, emission limits, units, or pass/fail status.

Keep missing or unrecognized values blank or mark them as requiring review. Show the source PDF and extraction status for each record.

If the source combines NOx and THC into one reported result, do not assume it provides separate NOx and THC values.

Allow the engineer to verify extracted values before final report generation.

## 6. Report Builder and Exports

For the PDF Cyclic Summary module, create a combined report in this order:

1. Editable front page.
2. Cyclic emission summary table.
3. Additional detailed results or pages where appropriate.

For the Excel Data Comparison module, allow the user to generate a report containing:
1. The appropriate editable front page.
2. Selected graphs.
3. Dataset descriptions.
4. Optional comparison statistics.
5. Optional detailed result tables.

For FTP, enforce the three-field front page requirement.

Provide:
- PDF export.
- Word (.docx) export.
- PNG export for individual graphs.
- Excel or CSV export for comparison results.

Ensure charts, tables, headers, footers, and page numbers are formatted correctly in the generated documents. Avoid clipped graphs and split table headings.

Provide a preview before exporting. Changes made in the report editor must be reflected in the exported file.

## 7. User Interface Design

Use a clean, modern engineering interface.

Design principles:
- Professional industrial software aesthetic.
- Light background and clear typography.
- Sidebar navigation.
- Consistent controls and spacing.
- Readable chart legends and axis labels.
- Responsive layout.
- Clear error messages and data validation.
- No unnecessary decorative cards or animations.

Suggested navigation:
- Dashboard
- Excel Comparison
- Presentation Mode
- PDF Cyclic Summary
- Report Preview

The two main modules must remain independent.

## 8. Technical Implementation

Use a reliable architecture suitable for large engine datasets.

Suggested technologies:
- React and TypeScript for the frontend.
- Plotly.js for interactive charts.
- Client-side or backend processing for Excel (.xlsx, .xlsm, .csv) and PDF parsing.
- Support local file uploads without external confidential storage.

Build the application in working stages. First implement both workflows and functional data processing, then improve the interface and report styling. All buttons must perform their stated actions.

Deliver a working application, not just a static visual mockup.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a0f30984-e514-4691-881e-66ea27e66727).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
