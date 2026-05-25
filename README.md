# AWE System - Automated Writing Evaluation

A Multimodal, LLM-based Automated Writing Evaluation (AWE) System for Formative Assessment

**For Foundation and Credit Course Students at Sultan Qaboos University**

---

## Overview

The system offers two dedicated Progressive Web Apps (PWAs):

- **AWE Student App** (free, no login) — for students to practice writing and receive instant feedback
- **iAWE Teacher App** (email-whitelisted, paid API access) — for instructors to evaluate student writing with full assessment capabilities

Both apps enable users to upload photos of handwritten essays, extract text using AI-powered OCR, and receive detailed, rubric-aligned assessments with constructive feedback. The system supports multiple courses across SQU's Foundation and Post-Foundation programs, each with tailored rubrics, word count targets, and assessment criteria. All student data is stored locally in the browser for privacy.

**Key capabilities:**

- Upload photos of handwritten essays (up to 2 pages) or type directly
- Extract text using Google Gemini OCR or Google Cloud Vision API
- Receive deterministic, AI-powered assessment based on course-specific rubrics aligned with CEFR levels
- Get humanized feedback with justifications, error classification, and improvement suggestions
- Score humanization: 9 built-in rules to soften scores while maintaining consistency (see [Score Humanization](#score-humanization--softening-rules))
- Select exam type (Mid-semester or Final) for FP0230 and FP0340 with appropriate word count targets
- Enter an optional writing prompt for Foundation Final Exam to guide assessment
- Practice summary writing and synthesis essay writing for LANC2160 with source texts
- Practice 4-paragraph essay writing for LANC1070 with mid-semester and final tests
- Download assessment reports as PDF
- Install either app on mobile devices for quick offline-capable access

---

## Supported Courses

### Foundation Program

| Course Code | Course Name | Rubric Scale | Exam Types |
|-------------|-------------|:------------:|------------|
| FP0230 | English Language Foundation I | 0-6 per criterion | Mid-semester (120 words) / Final (200 words) |
| FP0340 | English Language Foundation II | 0-6 per criterion | Mid-semester (120 words) / Final (200 words) |

**FP0230 & FP0340 Special Features:**
- Exam-type selection (Mid-semester or Final) with dynamic word count targets
- Optional writing prompt input for Final Exam — if provided by the instructor, it is appended to the assessment criteria sent to Gemini, enabling more focused and context-aware feedback

### Post-Foundation Program

| Course Code | Course Name | Rubric Scale | Writing Tasks |
|-------------|-------------|:------------:|---------------|
| LANC1070 | Academic English: Essay Writing | 0-25 per criterion | Mid-Semester Practice Tests / Final Practice Tests |
| LANC2160 | Academic English: Summary Writing & Synthesis Essay | 0-5 per criterion (2-Point) / 0-25 per criterion | Summary Writing / Synthesis Essay |
| LANC2146 | Report Writing | 0-5 per criterion | Discussion & Conclusion Practice (350-450 words, +/-20 tolerance) |

---

## Assessment Criteria

### Foundation Courses (FP0230, FP0340)

| Criterion | Scale | Description |
|-----------|:-----:|-------------|
| Task Response | 0-6 | How well the essay addresses the task requirements, audience, purpose, and genre |
| Coherence and Cohesion | 0-6 | Logical organization, paragraphing, and use of cohesive devices |
| Lexical Resource | 0-6 | Range and accuracy of vocabulary, word choice, and spelling |
| Grammatical Range and Accuracy | 0-6 | Range and accuracy of grammatical structures and punctuation |

**Total:** 24 marks | **Special Rules:** Off-topic penalties apply to Task Response and Lexical Resource. Score floor of 1/6 for genuine on-topic attempts (2/6 for Task Response). Half-point scoring (0.5 increments) enforced via constrained JSON schema.

### LANC1070 — 4-Paragraph Essay Rubric

| Criterion | Weight | Scale | Description |
|-----------|:------:|:-----:|-------------|
| Content (Task Achievement) | 25% | 0-25 | Addresses question, understanding of source, relevance, word count |
| Cohesion & Coherence (Organization) | 25% | 0-25 | Logical flow, thesis, paragraph structure, topic sentences, cohesive devices |
| Paraphrasing + Lexical Resources | 25% | 0-25 | Vocabulary appropriateness, spelling, originality, use of own words |
| Grammatical Range and Accuracy | 25% | 0-25 | Sentence correctness, effectiveness, originality, freedom from plagiarism |

**Total:** 100 marks | **Practice Tests:** 3 mid-semester practice tests available (job market skills, monopoly, marketing strategies). Expected CEFR level: A2-B1. Target word count: 300-350 words.

### LANC2160 — Summary Writing (2-Point Scale)

| Criterion | Scale | Description |
|-----------|:-----:|-------------|
| Task Achievement | 0-5 | How well the summary captures the main points from the source text |
| Coherence & Cohesion | 0-5 | Logical organization and linking of ideas within the summary |
| Lexical Resource | 0-5 | Range and accuracy of vocabulary used in the summary |
| Grammatical Range & Accuracy | 0-5 | Range and accuracy of grammatical structures in the summary |

**Total:** 20 marks | **Available Source Text:** "The Salmon Cannon" (613 words, target summary: 160-220 words)

### LANC2160 — Synthesis Essay (2-Point Scale)

| Criterion | Scale | Description |
|-----------|:-----:|-------------|
| Task Achievement | 0-5 | Quality of synthesis from multiple source texts, relevance of selected information |
| Coherence & Cohesion | 0-5 | Logical flow, paragraph structure, and effective use of cohesive devices |
| Lexical Resource | 0-5 | Range, accuracy, and appropriateness of vocabulary with proper paraphrasing |
| Grammatical Range & Accuracy | 0-5 | Range and accuracy of grammar, sentence structures, and punctuation |

**Total:** 20 marks

**Available Synthesis Assignments:**

| # | Title | Sources | Word Count | Paragraphs |
|---|-------|:-------:|:----------:|:----------:|
| 1 | Two Common Sources of Poisoning Nitrates | 3 | 200-300 | 4 |
| 2 | Two Advantages of the Xeros Waterless Washing Machine | 3 | 300-350 | 4 |

### LANC2146 — Report Writing: Discussion & Conclusion (B1-B2 Level)

| Criterion | Scale | Description |
|-----------|:-----:|-------------|
| Task Response | 0-5 | Analysis and interpretation of data with details/examples/statistics; quality of the discussion section; adequacy of the conclusion |
| Coherence and Cohesion | 0-5 | Logical organization of information and ideas; use of cohesive devices; paragraphing |
| Grammatical Range and Accuracy | 0-5 | Use of grammatical functions (cause/effect, compare/contrast, prediction, recommendation); grammar structures accuracy; punctuation |
| Lexical Resource | 0-5 | Vocabulary range and genre-specific register; spelling, word formation, and capitalization |

**Total:** 20 marks | **Word Count Target:** 350-450 words (ideal: 400) with +/-20 word tolerance (effective acceptable range: 330-470)

**Practice Test:** "Investigating the Effects of Seed Priming with PEG on Wheat Seedling Germination" — Students write the Discussion and Conclusion sections based on provided Abstract, Introduction, Methods, and Results (including a bar graph figure). Expected CEFR level: B1-B2.

---

## FP0340 Exam-Type Selection

FP0340 (English Language Foundation II) supports two exam types with different word count targets:

| Exam Type | Target Word Count | Acceptable Range |
|-----------|:-----------------:|:----------------:|
| Mid-semester Exam | 120 words | 110-130 words |
| Final Exam | 200 words | 190-210 words |

When FP0340 is selected, students choose between "For Mid-semester Exam" and "For Final Exam." For the Final Exam, an optional writing prompt field appears — students can enter the essay topic or prompt provided by their instructor. If a writing prompt is entered, it is appended to the assessment criteria sent to Gemini, enabling the AI to evaluate the essay with awareness of the specific topic context.

---

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript
- **Styling:** Tailwind CSS 4, shadcn/ui
- **State Management:** Zustand (persisted to localStorage)
- **AI Assessment:** Google Gemini with hybrid model routing (see [Model Routing](#hybrid-model-routing))
- **OCR:** Google Gemini + Google Cloud Vision API (DOCUMENT_TEXT_DETECTION)
- **Scoring:** Deterministic (temperature 0.0) with constrained JSON schemas enforcing valid 0.5-increment scores
- **Animations:** Framer Motion
- **PDF Generation:** PDFKit
- **Testing:** Vitest
- **CI/CD:** GitHub Actions (lint, typecheck, tests, build)
- **Deployment:** Vercel (serverless)

---

## Project Structure

```
awe-system/
├── .github/workflows/
│   └── build.yml              # CI pipeline (lint, typecheck, test, build)
├── public/
│   ├── squ_logo.png           # SQU logo
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker
├── prisma/
│   └── schema.prisma          # Database schema (optional)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── assess/route.ts    # AI assessment endpoint (Gemini)
│   │   │   ├── courses/route.ts   # Course data endpoint
│   │   │   ├── essays/route.ts    # Essay CRUD endpoint
│   │   │   ├── ocr/route.ts       # OCR processing (Gemini + Vision)
│   │   │   └── pdf/route.ts       # PDF report generation
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx               # Main application (SPA router)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── screens/               # Modular screen components
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── SetupScreen.tsx
│   │   │   ├── CourseSelectionScreen.tsx
│   │   │   ├── UploadScreen.tsx
│   │   │   ├── ReviewScreen.tsx
│   │   │   ├── AssessmentScreen.tsx
│   │   │   ├── ResultsScreen.tsx
│   │   │   ├── RecordsScreen.tsx
│   │   │   └── RecordDetailScreen.tsx
│   │   ├── layout/                # Layout components
│   │   │   ├── AppShell.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MobileNav.tsx
│   │   └── ErrorBoundary.tsx
│   ├── hooks/                    # Custom React hooks
│   └── lib/
│       ├── store.ts              # Zustand store (courses, assignments, state)
│       ├── scoring-utils.ts      # Score recalculation utilities
│       ├── display-utils.ts      # Display formatting helpers
│       ├── image-utils.ts        # Image processing utilities
│       ├── animations.ts         # Framer Motion animation configs
│       └── __tests__/            # Unit tests
│           └── scoring-utils.test.ts
├── CONTRIBUTING.md               # Contribution guidelines
├── CITATION.cff                  # Machine-readable citation file
├── LICENSE                       # MIT License
├── vitest.config.ts              # Vitest configuration
├── vercel.json                   # Vercel deployment config
└── package.json
```

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- npm or Bun runtime
- Google Gemini API key (free tier available)
- Google Cloud Vision API key (optional, for enhanced OCR)

### Installation

```bash
# Clone the repository
git clone https://github.com/waleedmandour/awe-system1.git
cd awe-system1

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint checks |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Run TypeScript type checking |

---

## Deployment on Vercel

The AWE System is configured for one-click deployment on [Vercel](https://vercel.com). The project uses serverless API routes for OCR and assessment, and all student data is stored in the browser's localStorage — no server-side database is required for core functionality.

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/waleedmandour/awe-system)

### Manual Deploy

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click "Import Git Repository"
3. Select `waleedmandour/awe-system`
4. Leave all defaults — Vercel auto-detects Next.js
5. Click "Deploy"

> **Note:** No environment variables are required. API keys (Gemini, Vision) are entered by users directly in the app and stored in their browser's localStorage.

---

## PWA Installation

Students can install the app on their devices for a native-like experience:

**iOS (Safari):**
1. Open the app URL in Safari
2. Tap Share > "Add to Home Screen"

**Android (Chrome):**
1. Open the app URL in Chrome
2. Tap Menu > "Install app"

---

## API Keys

API keys are entered by each user inside the app and stored locally in their browser. No server-side keys are needed for deployment.

### Gemini API Key (Required)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click "Get API Key"
3. Free tier: 15 requests/minute

### Google Vision OCR Key (Optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable "Cloud Vision API"
3. Create credentials > API Key
4. Free tier: 1,000 units/month

---

## Privacy & Security

- No data is shared with third parties beyond Google APIs (OCR and assessment)
- API keys are stored locally in each user's browser (localStorage)
- Essays and assessment records are stored in the browser, not on any server
- Server-side API routes only proxy requests to Google APIs
- Safety filters are configured to minimize false-positive blocking of academic content

---

## Design Features

- **Mobile-First:** Optimized for iOS and Android with touch-friendly UI, safe area support, and iOS press effects
- **Smooth Animations:** Framer Motion page transitions and micro-interactions
- **SQU Branding:** Blue and gold color scheme for Teacher App, green and gold for Student App, supporting 5 courses
- **Dark Mode:** Automatic theme detection (light/dark/system)
- **PWA Features:** Offline support, install prompts, service worker caching
- **Responsive:** Works seamlessly on phones, tablets, and desktop browsers
- **Error Boundaries:** Graceful error handling with user-friendly fallback UI
- **Modular Architecture:** Screen-based component structure for maintainability

---

## Score Humanization & Softening Rules

The assessment engine applies 9 humanization rules to ensure fair, encouraging, and consistent scoring across all courses. These rules are embedded in both the Foundation and Credit assessment prompts, with deterministic TypeScript enforcement as a backup.

| # | Rule | Description |
|---|------|-------------|
| 1 | **First Draft Awareness** | Essays are handwritten exam first drafts under timed conditions — no penalty for lack of polish or editing |
| 2 | **OCR Error Forgiveness** | All apparent spelling errors are treated as potential OCR artifacts by default; only errors repeating 3+ times consistently are flagged as genuine student errors |
| 3 | **Arabic L1 Transfer Recognition** | 7 common Arabic-to-English transfer patterns (e.g., missing copula "be", article omissions, adjective-noun reversal) are classified as expected developmental errors, not penalized |
| 4 | **Anti-Double-Penalization** | Each error is penalized in only one criterion — the one where it primarily belongs |
| 5 | **Effort Reward (Attempted Complexity)** | Students who attempt complex structures or vocabulary are not scored lower than students who use only simple, correct forms |
| 6 | **Score Floor for Genuine Attempts** | On-topic essays with ≥50% of minimum word count receive at least 1/6 per criterion (2/6 for Task Response on Foundation) — enforced in both prompt and TypeScript |
| 7 | **Borderline Benefit of the Doubt** | When genuinely uncertain between two bands, the higher band is awarded |
| 8 | **Feedback Tone Guardrails** | All feedback starts with strengths, uses asset-based language, and avoids judgmental phrasing |
| 9 | **Holistic Consistency Check** | After scoring all criteria, verifies that score spread does not exceed 2 points; flags potential over-penalization |

These rules apply to both Foundation (0–6 scale) and Credit (0–5 scale) courses, with appropriate adaptations for each CEFR level.

---

## Hybrid Model Routing

The system uses a **hybrid multi-tier routing strategy** that automatically selects different Gemini models based on course complexity:

| Course Type | Primary Model | Fallback Model | Rationale |
|-------------|:-------------:|:--------------:|-----------|
| Foundation (FP0230, FP0340) | `gemini-2.5-flash` | `gemini-2.5-flash-lite` | Messier handwriting, more OCR noise, more borderline cases — needs stronger instruction-following |
| Credit / Summary / Synthesis / LANC2146 / LANC1070 | `gemini-2.5-flash-lite` | `gemini-2.5-flash` | More structured writing, clearer rubric application — lighter model sufficient |

**Scoring determinism is enforced through:**
- `temperature: 0.0` — forces greedy decoding for identical outputs on identical inputs
- **Constrained JSON schemas** — Foundation uses a `STRING` enum (`['0', '0.5', '1', ...,'6']`) and Credit uses `['0', '0.5', '1', ...,'5']`, preventing the model from outputting invalid intermediate decimals
- **TypeScript post-processing** — score clamping, 0.5-increment rounding, and score floor enforcement as a deterministic backup
- **`thinkingConfig: { thinkingBudget: 0 }`** — disables extended reasoning on Gemini 2.5+ models for faster, more deterministic responses

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit pull requests, report bugs, and suggest features.

---

## Credits

## Project Team

- **Jokha Al Hosni** — Team Head
- **Sanna Al Hudhifi** — Member
- **Waleed Mandour** — Member

**Institution:** Sultan Qaboos University — Center for Preparatory Studies

---

## How to Cite

If you use the **iAWE System** in your research, teaching, or publications, please cite it as follows:

### APA

> Mandour, W. (2025). *iAWE System: A Multimodal, LLM-based Automated Writing Evaluation System for Formative Assessment* (Version 2.0.0) [Computer software]. Sultan Qaboos University — Center for Preparatory Studies. https://github.com/waleedmandour/awe-system1

### BibTeX

```bibtex
@software{mandour_awe_system_2025,
  author    = {Mandour, Waleed},
  title     = {{iAWE System: A Multimodal, LLM-based Automated Writing Evaluation System for Formative Assessment}},
  year      = {2025},
  version   = {2.0.0},
  publisher = {Sultan Qaboos University -- Center for Preparatory Studies},
  url       = {https://github.com/waleedmandour/awe-system1}
}
```

### MLA

> Mandour, Waleed. *iAWE System: A Multimodal, LLM-based Automated Writing Evaluation System for Formative Assessment*. Version 2.0.0, Sultan Qaboos University — Center for Preparatory Studies, 2025, https://github.com/waleedmandour/awe-system1.


---

## License

This project is licensed under the [MIT License](LICENSE).

---

*Built with ♥️ to the Language Teaching Community.*
