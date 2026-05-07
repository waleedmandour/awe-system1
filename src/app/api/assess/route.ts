import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// IMPORTANT: Vercel Hobby plan ($20/mo) allows maxDuration = 60.
// On the FREE tier, Vercel caps serverless functions at 10 seconds regardless of this setting.
// Prompts are optimised to complete within the 10-second free tier limit where possible.
export const maxDuration = 60;

// Word count targets by course and exam type for Foundation courses
const FOUNDATION_WORD_COUNTS: Record<string, Record<string, { min: number; max: number; ideal: number; label: string }>> = {
  '0230': {
    'mid-semester': { min: 90, max: 130, ideal: 120, label: 'FP0230 Mid-semester Exam' },
    'final':        { min: 110, max: 140, ideal: 120, label: 'FP0230 Final Exam' },
  },
  '0340': {
    'mid-semester': { min: 110, max: 150, ideal: 120, label: 'FP0340 Mid-semester Exam' },
    'final':        { min: 140, max: 220, ideal: 200, label: 'FP0340 Final Exam' },
  },
};

// Default word count target per course (used when no exam type is specified)
const DEFAULT_FOUNDATION_WORD_COUNTS: Record<string, { min: number; max: number; ideal: number; label: string }> = {
  '0230': { min: 90, max: 130, ideal: 120, label: 'FP0230 Foundation Exam' },
  '0340': { min: 110, max: 150, ideal: 120, label: 'FP0340 Foundation Exam' },
};

// Condensed assessment rubrics for Foundation courses (0230, 0340)
// Merged 7 bands -> 5 bands to reduce token consumption while preserving accuracy.
const FOUNDATION_RUBRICS = {
  criteria:[
    {
      name: 'Task Response',
      maxScore: 6,
      description: 'How well the essay addresses the task requirements, audience, purpose, and genre.',
      rubric: {
        '0-2.5': 'Poor to Weak: Fails to fulfill task requirements. Minimal awareness of audience/purpose/genre. Very limited or no topic development. Length likely inappropriate.',
        '3-3.5': 'Unsatisfactory to Satisfactory: Partially fulfills task requirements. Some awareness of audience/purpose/genre. Topic development attempted but limited, predictable, or irrelevant in places. Length may be inappropriate.',
        '4-4.5': 'Good to Very Good: Fulfills all specific task requirements. Good to very good awareness of audience/purpose/genre. Topic is well developed with some depth. Little more could be expected.',
        '5-6': 'Excellent: Fulfills all task requirements and exceeds expectations. High awareness of audience/purpose/genre. Topic is fully developed and thoroughly explored.'
      }
    },
    {
      name: 'Coherence and Cohesion',
      maxScore: 6,
      description: 'Logical organization, paragraphing, and use of cohesive devices.',
      rubric: {
        '0-2.5': 'Poor to Weak: Very little control of organization. Text is largely confused/incoherent. Ideas disconnected. No paragraphs or very poor paragraphing. Cohesive devices absent or misused.',
        '3-3.5': 'Unsatisfactory to Satisfactory: Limited organization, coherence may be inconsistent. Ideas may lack progression or repeat. Paragraphing generally appropriate. Cohesive devices may be over/under used or mechanical.',
        '4-4.5': 'Good to Very Good: Information and ideas clearly organized. Each paragraph has a main topic with relevant details. Cohesive devices used accurately within and between sentences.',
        '5-6': 'Excellent: Information organized so effectively that text has fluent progression throughout. Opening/closing sections appropriate and fully developed. Cohesive devices used consistently and accurately.'
      }
    },
    {
      name: 'Lexical Resource',
      maxScore: 6,
      description: 'Range and accuracy of vocabulary, word choice, and spelling.',
      rubric: {
        '0-2.5': 'Poor to Weak: Vocabulary very limited and frequently inappropriate. Word choice and spelling errors pervasive, severely impede communication.',
        '3-3.5': 'Unsatisfactory to Satisfactory: Limited but adequate vocabulary for the level. Core vocabulary usually accurate. Attempts to extend range may show some inaccuracy affecting communication in places.',
        '4-4.5': 'Good to Very Good: Good to very good vocabulary range for the level. Core vocabulary frequently used accurately. Occasional inaccuracy does not affect communication.',
        '5-6': 'Excellent: Significantly wider vocabulary range than expected. Core vocabulary consistently used accurately. Occasional errors only where more complex/creative lexis is attempted.'
      }
    },
    {
      name: 'Grammatical Range and Accuracy',
      maxScore: 6,
      description: 'Range and accuracy of grammatical structures and punctuation.',
      rubric: {
        '0-2.5': 'Poor to Weak: Inaccurate structures, errors predominate, preventing meaningful communication. Punctuation inadequate/absent.',
        '3-3.5': 'Unsatisfactory to Satisfactory: Limited but adequate range of structures for the level. Core structures usually accurate but may be mechanical. Grammatical errors may affect communication in places.',
        '4-4.5': 'Good to Very Good: Good range of structures. Core structures frequently used accurately. Some inaccuracy without affecting communication. Punctuation well managed.',
        '5-6': 'Excellent: Significantly wider range of structures than expected. Core structures consistently used accurately. Occasional errors only with complex structures. Punctuation well managed.'
      }
    }
  ],
  specialRules:[
    'If the text is somewhat off-topic, deduct 50% of the mark obtained for Task Response and Lexical Resource.',
    'A completely off-topic text should receive a zero for Task Response and Lexical Resource.'
  ]
};

// Post-foundation/Credit course criteria (LANC2160) — Synthesis Essay
const CREDIT_CRITERIA = [
  { name: 'Task Achievement', maxScore: 5, description: 'How well the essay achieves the task requirements' },
  { name: 'Coherence & Cohesion', maxScore: 5, description: 'Logical organization and linking of ideas' },
  { name: 'Lexical Resource', maxScore: 5, description: 'Range and accuracy of vocabulary' },
  { name: 'Grammatical Range & Accuracy', maxScore: 5, description: 'Range and accuracy of grammar' },
];

// Summary Writing criteria for LANC2160 (A2-B1 level, 0-5 per criterion)
const SUMMARY_CRITERIA = [
  {
    name: 'Task Achievement',
    maxScore: 5,
    description: 'How effectively the summary captures the main points of the source text using the student\'s own words.'
  },
  {
    name: 'Coherence & Cohesion',
    maxScore: 5,
    description: 'How logically the summary is organized and how well ideas are linked together.'
  },
  {
    name: 'Lexical Resource',
    maxScore: 5,
    description: 'The range and accuracy of vocabulary used, including paraphrasing ability.'
  },
  {
    name: 'Grammar & Accuracy',
    maxScore: 5,
    description: 'The range and accuracy of grammatical structures, sentence variety, and punctuation.'
  },
];

// Condensed rubric band descriptors for Summary Writing (A2-B1 level)
// Merged 7 bands → 5 bands to reduce token consumption while preserving accuracy.
const SUMMARY_RUBRICS = {
  criteria: [
    {
      name: 'Task Achievement',
      maxScore: 5,
      rubric: {
        '0-2': 'Poor to Unsatisfactory: Captures few or no main ideas. Paraphrasing minimal; heavy reliance on copying. May include irrelevant details or personal opinions.',
        '2.5': 'Below expectations: Captures most main ideas but misses key points. Some paraphrasing attempted but noticeable copying remains. Does not clearly distinguish main from minor ideas.',
        '3-3.5': 'Satisfactory to Good: Captures main ideas adequately. Paraphrasing generally effective though some phrases may be copied. Supporting details appropriately selected.',
        '4-4.5': 'Very good to Excellent: Captures all main ideas clearly and accurately. Effective paraphrasing throughout. Focused, cohesive summary with minimal irrelevant details.',
        '5': 'Outstanding: Highly accurate, comprehensive reflection of source text. Sophisticated comprehension with consistently natural paraphrasing. Reads as a well-constructed independent text.',
      }
    },
    {
      name: 'Coherence & Cohesion',
      maxScore: 5,
      rubric: {
        '0-2': 'Poor to Unsatisfactory: Minimal or no organization. Ideas listed but not connected. Very few linking words. Disjointed presentation requiring reader effort to follow.',
        '2.5': 'Below expectations: Basic organization present but inconsistent. Some simple linking words used but transitions are abrupt. Paragraph structure may be weak. Understandable but not smooth.',
        '3-3.5': 'Satisfactory to Good: Logical structure generally easy to follow. Linking words and transitional devices used correctly. Smooth flow between ideas. Appropriate paragraph structure.',
        '4-4.5': 'Very good to Excellent: Clearly and logically organized with strong progression. Wide range of cohesive devices used effectively and naturally. Highly readable.',
        '5': 'Outstanding: Exceptionally well-organized with flawless logical flow. Cohesive devices used with mastery. Structure serves the content and enhances comprehension.',
      }
    },
    {
      name: 'Lexical Resource',
      maxScore: 5,
      rubric: {
        '0-2': 'Poor to Unsatisfactory: Extremely limited vocabulary insufficient to convey meaning. Paraphrasing largely absent. Word choice frequently inaccurate. Spelling errors pervasive.',
        '2.5': 'Below expectations: Vocabulary limited but generally adequate. Paraphrasing attempted with some success though word choice may be awkward. Core vocabulary correct but little range.',
        '3-3.5': 'Satisfactory to Good: Adequate to good range of vocabulary. Paraphrasing generally effective. Some less common vocabulary attempted. Spelling generally accurate.',
        '4-4.5': 'Very good to Excellent: Varied and appropriate vocabulary. Effective, natural-sounding paraphrasing. Strong control of word choice and collocation. Spelling consistently accurate.',
        '5': 'Outstanding: Sophisticated, precise vocabulary with excellent control. Consistently natural and effective paraphrasing. Word choice enhances clarity.',
      }
    },
    {
      name: 'Grammar & Accuracy',
      maxScore: 5,
      rubric: {
        '0-2': 'Poor to Unsatisfactory: Little grammatical control. Simple structures attempted but often contain errors. Limited variety. Common errors (articles, tenses) frequent. Punctuation often incorrect.',
        '2.5': 'Below expectations: Simple sentences reasonably accurate, complex sentences contain errors. Some variety attempted. Common errors still occur but do not always impede understanding.',
        '3-3.5': 'Satisfactory to Good: Simple sentences accurate with some complex structures. Reasonable range of grammatical structures. Errors typically minor. Punctuation generally accurate.',
        '4-4.5': 'Very good to Excellent: Good/strong control including complex sentences. Errors infrequent and minor. Sentence variety enhances quality. Punctuation accurate and effective.',
        '5': 'Outstanding: Near-native control. Wide variety of sentence structures used naturally and accurately. Errors virtually non-existent. Punctuation flawless.',
      }
    },
  ],
};

// Synthesis Essay criteria for LANC2160 (A2-B1 level, 0-5 per criterion)
const SYNTHESIS_CRITERIA = [
  {
    name: 'Task Achievement',
    maxScore: 5,
    description: 'How effectively the synthesis essay fulfils the task requirements, synthesizes information from all source texts, and addresses the assignment prompt.'
  },
  {
    name: 'Coherence and Cohesion',
    maxScore: 5,
    description: 'How logically the synthesis essay is organized, how well ideas are linked, and how effectively information flows.',
  },
  {
    name: 'Lexical Resource',
    maxScore: 5,
    description: 'The range and accuracy of vocabulary, including paraphrasing ability and appropriate word choice.',
  },
  {
    name: 'Grammatical Range and Accuracy',
    maxScore: 5,
    description: 'The range and accuracy of grammatical structures, sentence variety, and punctuation.',
  },
];

// Detailed rubric band descriptors for Synthesis Essay (A2-B1 level, TWO-POINT ESSAY WRITING MARKING CRITERIA)
// Condensed by merging duplicate adjacent bands to reduce token consumption
const SYNTHESIS_RUBRICS = {
  criteria: [
    {
      name: 'Task Achievement',
      maxScore: 5,
      rubric: {
        '0-1.5': 'Poor: Fails to fulfil any task requirements. 10% or more outside word count.',
        '2-2.5': 'Unsatisfactory: Does not adequately fulfil task requirements. Most details are unimportant. 10% or more outside word count.',
        '3-3.5': 'Satisfactory: Adequately fulfils task requirements. Most main ideas present. Meaning generally accurate; some unimportant details may be included. Up to 10% outside word count.',
        '4-4.5': 'Good: Fulfils all task requirements but a little more could be expected. Main ideas present. Meaning mostly accurate, most details relevant. Stays within word count.',
        '5': 'Excellent: Fulfils all task requirements and exceeds expectations. All main ideas present. Meaning accurate, all details relevant. Stays within word count.',
      }
    },
    {
      name: 'Coherence and Cohesion',
      maxScore: 5,
      rubric: {
        '0-1.5': 'Poor: Lacks organization and coherence. Text largely confused and incoherent, challenging for reader to process.',
        '2-2.5': 'Unsatisfactory: Organization and coherence limited. Some re-reading necessary. Most cohesive devices are simple, used inaccurately and mechanically.',
        '3-3.5': 'Satisfactory: Organization and coherence often adequate, but supporting ideas may be limited. Text may be stilted. Cohesive devices sometimes inaccurate, repetitive, or over/under used.',
        '4-4.5': 'Good: Organization makes text clear and easy to understand. Cohesive devices almost always used accurately and appropriately within and between sentences.',
        '5': 'Excellent: Effective organization with logical flow throughout. Good range of cohesive devices used accurately and appropriately.',
      }
    },
    {
      name: 'Lexical Resource',
      maxScore: 5,
      rubric: {
        '0-1.5': 'Poor: Paraphrasing largely absent. Poor word choice, word form, and spelling prevent communication.',
        '2-2.5': 'Unsatisfactory: Very little paraphrasing; more than 15% directly copied. Inadequate vocabulary range. Errors in word choice, word form, and spelling predominate and affect communication.',
        '3-3.5': 'Satisfactory: Generally paraphrased; some copying but less than 15%. Limited but adequate vocabulary. Errors in word choice and spelling sometimes affect communication.',
        '4-4.5': 'Good: Well paraphrased with very little copying. Good vocabulary range. Spelling mostly correct.',
        '5': 'Excellent: Completely and accurately paraphrased. Wider vocabulary range than expected for the level. Spelling accurate.',
      }
    },
    {
      name: 'Grammatical Range and Accuracy',
      maxScore: 5,
      rubric: {
        '0-1.5': 'Poor: Inaccurate structures, errors predominate, preventing communication. Punctuation inadequate and/or inaccurate.',
        '2-2.5': 'Unsatisfactory: Very limited structures inadequate for the level. Grammatical errors noticeable and often affect communication. Punctuation may be inadequate/inaccurate.',
        '3-3.5': 'Satisfactory: Structures sometimes limited but adequate for the task. Grammatical errors may affect communication in places. Punctuation generally correct and effective.',
        '4-4.5': 'Good: Good range of structures. Some inaccuracy but communication not affected. Punctuation well managed and effective.',
        '5': 'Excellent: Wider range of structures than expected for the level. Most sentences error-free. Punctuation well managed and effective.',
      }
    },
  ],
};

// ─── LANC2146 Report Writing — Discussion & Conclusion Assessment ─────────────

// Lab Report Discussion and Conclusion criteria (A2-B1 level, 0-5 per criterion)
const LANC2146_CRITERIA = [
  {
    name: 'Task Response',
    maxScore: 5,
    description: 'Analysis and interpretation of data with details/examples/statistics; quality of the discussion section; adequacy of the conclusion (most obvious result, reference to previous research, restatement of aim, solutions/recommendations).',
  },
  {
    name: 'Coherence and Cohesion',
    maxScore: 5,
    description: 'Logical organization of information and ideas; use of cohesive devices (conjunctions and linkers); paragraphing.',
  },
  {
    name: 'Grammatical Range and Accuracy',
    maxScore: 5,
    description: 'Use of grammatical functions (cause/effect, compare/contrast, prediction, recommendation/suggestion/solution); grammar structures accuracy; punctuation.',
  },
  {
    name: 'Lexical Resource',
    maxScore: 5,
    description: 'Vocabulary range and genre-specific register; spelling, word formation, and capitalization.',
  },
];

// Condensed rubric band descriptors for LANC2146 Discussion & Conclusion (A2-B1 level)
// Merged 7 bands -> 5 bands to reduce token consumption while preserving accuracy.
const LANC2146_RUBRICS = {
  criteria: [
    {
      name: 'Task Response',
      maxScore: 5,
      rubric: {
        '1-2': 'Poor to Unsatisfactory: Analysis/interpretation of main trend lacks specific details, examples, or statistics. Conclusion is missing, irrelevant, or insufficient. May not refer to previous research or restate aim.',
        '3': 'Satisfactory: Analysis/interpretation of one main trend supported by relevant details and some statistics. Conclusion adequately summarizes obvious result, refers to previous research, restates aim, provides general recommendations, but may have gaps.',
        '4': 'Good: Analysis/interpretation of main trend supported by adequate details, examples, and relevant statistics. Conclusion adequately summarizes result, refers to research, restates aim, provides general recommendations.',
        '5': 'Excellent: Analysis/interpretation supported by carefully chosen details and comprehensive statistics. Conclusion provides insightful summary, refers to research, restates aim, provides specific recommendations.',
      }
    },
    {
      name: 'Coherence and Cohesion',
      maxScore: 5,
      rubric: {
        '1-2': 'Poor to Unsatisfactory: Lacks coherent development. Ideas disjointed/illogical. Cohesive devices missing or inaccurate. Paragraphs lack clear organization.',
        '3': 'Satisfactory: Generally logical but may not be fully coherent. Cohesive devices may be too simple, over/under used, creating weak transitions. Paragraph organization not sustained.',
        '4': 'Good: Sufficient depth with some weak transitions. Cohesive devices usually used accurately. Paragraphs exhibit clear organization and unity.',
        '5': 'Excellent: Seamless flow with effective transitions. Extensive range of cohesive devices used accurately. Paragraphs exceptionally well-organized.',
      }
    },
    {
      name: 'Grammatical Range and Accuracy',
      maxScore: 5,
      rubric: {
        '1-2': 'Poor to Unsatisfactory: Little to limited control of grammar. Repetitive sentence structures. Severe errors impede understanding. Punctuation errors prevalent.',
        '3': 'Satisfactory: Adequate grammar control but repetitive structures. Occasional errors which may impede understanding. Punctuation generally adequate.',
        '4': 'Good: Proficient grammar with a range of structures. Few errors that do not impede understanding. Most sentences error-free. Punctuation generally correct.',
        '5': 'Excellent: Exemplary grammar with varied sentence structures. No errors. Punctuation error-free and enhances readability.',
      }
    },
    {
      name: 'Lexical Resource',
      maxScore: 5,
      rubric: {
        '1-2': 'Poor to Unsatisfactory: Basic, repetitive, or inappropriate vocabulary. Limited word formation control. Frequent spelling/capitalization errors.',
        '3': 'Satisfactory: Adequate vocabulary range. Generally appropriate word choice with some repetition. Some spelling/word formation errors may cause difficulty.',
        '4': 'Good: Wide vocabulary with uncommon items allowing flexibility and precision. Occasional inaccuracies in word choice/collocation. Rare spelling errors.',
        '5': 'Excellent: Rich, varied vocabulary perfectly suited to context. Sophisticated lexical control. No spelling/word formation errors.',
      }
    },
  ],
};

// Build prompt for LANC2146 Report Writing (Discussion & Conclusion)
function buildLanc2146Prompt(
  studentText: string,
  reportSections: { title: string; content: string }[],
  resultsCaption: string | null,
  resultsGraphDescription: string | null,
  assignmentTitle: string,
  wordCount: number,
  targetWordCount: { min: number; max: number; ideal: number }
): string {
  const rubrics = LANC2146_RUBRICS;
  const totalMaxScore = LANC2146_CRITERIA.reduce((sum, c) => sum + c.maxScore, 0); // 20

  // Word count tolerance: +/-20 words beyond the target range is acceptable without penalty
  const toleranceBelow = targetWordCount.min - 20;
  const toleranceAbove = targetWordCount.max + 20;

  const wordCountStatus = wordCount < toleranceBelow
    ? `WARNING: Word count (${wordCount}) is SIGNIFICANTLY BELOW the required range of ${targetWordCount.min}-${targetWordCount.max} words (more than 20 words below minimum). This MUST lower the Task Response score.`
    : wordCount < targetWordCount.min
    ? `NOTE: Word count (${wordCount}) is slightly below the required range of ${targetWordCount.min}-${targetWordCount.max} words (within 20-word tolerance). Minor flexibility is acceptable — do NOT penalize.`
    : wordCount > toleranceAbove
    ? `NOTE: Word count (${wordCount}) significantly exceeds the target range of ${targetWordCount.min}-${targetWordCount.max} words (more than 20 words above maximum). Do NOT deduct marks for exceeding the word limit. However, you MUST mention this in your feedback.`
    : wordCount > targetWordCount.max
    ? `Word count (${wordCount}) is slightly above the target range of ${targetWordCount.min}-${targetWordCount.max} words (within 20-word tolerance). Do NOT deduct marks — just note it in the feedback if relevant.`
    : `Word count (${wordCount}) is within the acceptable range of ${targetWordCount.min}-${targetWordCount.max} words.`;

  const criteriaDetails = rubrics.criteria.map(c => {
    const rubricLevels = Object.entries(c.rubric)
      .map(([score, desc]) => `  Score ${score}: ${desc}`)
      .join('\n');
    return `${c.name} (0-${c.maxScore}):\n${rubricLevels}`;
  }).join('\n\n');

  const sectionsText = reportSections.map(s => `=== ${s.title} ===\n${s.content}`).join('\n\n');

  return `You are an expert writing assessor for LANC2146 (Report Writing — Discussion & Conclusion) at Sultan Qaboos University. CEFR A2-B1 level. Use simple, clear language.

ASSIGNMENT: ${assignmentTitle}

WRITING TASK: Write an appropriate Discussion and Conclusion for the report based on the provided sections.

TARGET WORD COUNT: ${targetWordCount.min}-${targetWordCount.max} words (ideal: ${targetWordCount.ideal}). Tolerance: +/-20 words (${toleranceBelow}-${toleranceAbove}).

${wordCountStatus}

PROVIDED REPORT SECTIONS:
${sectionsText}
${resultsCaption ? `\nRESULTS FIGURE CAPTION: ${resultsCaption}${resultsGraphDescription ? `\nNote: The student was expected to read the bar graph showing the results of the experiment. ${resultsGraphDescription}` : ''}` : ''}

STUDENT'S DISCUSSION AND CONCLUSION:
"""
${studentText}
"""

ASSESSMENT RUBRICS (LANC2146 — Discussion and Conclusion):

${criteriaDetails}

POINTS TO CONSIDER:
- TR: Discussion — analysis/interpretation with details/examples/statistics. Conclusion — obvious result, previous research reference, aim restatement, recommendations.
- C&C: Logical organization, cohesive devices, paragraphing
- GRA: Functions (cause/effect, compare/contrast, prediction, recommendation), grammar accuracy, punctuation
- LR: Vocabulary range, genre-specific register, spelling/word formation/capitalization

============================================================
SCORING INSTRUCTIONS:
============================================================

BEFORE SCORING — DIAGNOSE FIRST: For EACH criterion, actively scan the student's text for SPECIFIC errors, weaknesses, and strengths. Do NOT give a score until you have identified at least one concrete piece of evidence (a quoted phrase). This prevents generic scoring.

STEP 1 — Score each criterion INDEPENDENTLY using the FULL range (0-5, 0.5 increments). Do NOT default to middle scores (3-3.5). Award HIGH scores (4-5) ONLY if the text genuinely matches the upper rubric bands. Award LOW scores (0-1) if the text clearly matches the lower rubric bands. Score based ONLY on how the text aligns with the rubric descriptors. If quality falls between bands, award a half-point.

STEP 2 — For EACH criterion, write a Justification that:
  (a) Names the score band chosen
  (b) Quotes at least ONE exact phrase from the student's text as evidence
  (c) Explains why the text fits that band — connect evidence to the rubric

STEP 3 — List up to 3 specific errors per criterion in the "mistakes" array. Each mistake MUST have:
  - "quote": the EXACT words from the student's text that contain the error
  - "explanation": WHY it is wrong (grammar rule broken, wrong word choice, etc.) — do NOT provide corrections
  If you genuinely cannot find any error for a criterion, you may set mistakes to [] — but this should be rare.

STEP 4 — For EACH criterion, write:
  - "strengths": 1-2 specific things the student did well in this criterion (quote evidence)
  - "suggestions": 1-2 specific, actionable improvements for this criterion

STEP 5 — overallFeedback (3-4 sentences): strongest/weakest criterion, Discussion analysis quality, Conclusion adequacy, one prioritized action item.

STEP 6 — totalScore = sum of scores (max ${totalMaxScore}). percentage = round(totalScore / ${totalMaxScore} * 100).

============================================================
CRITICAL OUTPUT RULES:
- Respond with ONLY raw JSON. No markdown, no code fences, no commentary.
- Straight double quotes only. No trailing commas. No smart/curly quotes.
- Use bullet points (•) in justification, strengths, suggestions, and overallFeedback.
- SCORE INDEPENDENTLY: The example JSON below shows FORMAT ONLY — do NOT copy its example scores. Score each criterion based on the actual student text quality against the rubric bands.
- MANDATORY: Every score entry MUST include justification, strengths, mistakes, and suggestions fields.

JSON FORMAT:
============================================================
{
  "scores": [
    {
      "criterionName": "Task Response",
      "score": 4,
      "maxScore": 5,
      "justification": "Score 4: Good. Discussion analyses main trend with details. Quote: \\"[exact phrase]\\" shows [rubric alignment]. Conclusion restates aim.",
      "strengths": "[specific strengths with evidence]",
      "mistakes": [
        { "quote": "[exact error from text]", "explanation": "[why wrong, no correction]" },
        { "quote": "[exact error from text]", "explanation": "[why wrong]" }
      ],
      "suggestions": "[specific actionable improvement]"
    },
    {
      "criterionName": "Coherence and Cohesion",
      "score": 3,
      "maxScore": 5,
      "justification": "Score 3 — Satisfactory. [explanation with quote]",
      "strengths": "[specific strengths]",
      "mistakes": [
        { "quote": "[exact error]", "explanation": "[why wrong]" }
      ],
      "suggestions": "[specific improvement]"
    }
  ],
  "totalScore": 16,
  "maxScore": ${totalMaxScore},
  "percentage": 80,
  "overallFeedback": "Strongest: [criterion] because [reason]. Weakest: [criterion] because [reason]. Discussion: [evaluation]. Conclusion: [evaluation]. Focus on: [action]."
}`;
}

// Build detailed rubric prompt for Foundation courses
function buildFoundationPrompt(text: string, topic: string | null, wordCount: number, targetWordCount: { min: number; max: number; ideal: number; label?: string }): string {
  const rubrics = FOUNDATION_RUBRICS;
  const totalMaxScore = rubrics.criteria.reduce((sum, c) => sum + c.maxScore, 0); // 24

  // Word count tolerance: +/-10 words beyond the target range is acceptable without penalty
  const toleranceBelow = targetWordCount.min - 10;
  const toleranceAbove = targetWordCount.max + 10;

  const wordCountStatus = wordCount < toleranceBelow
    ? `WARNING: Word count (${wordCount}) is SIGNIFICANTLY BELOW the required range of ${targetWordCount.min}-${targetWordCount.max} words (more than 10 words below minimum). This MUST lower the Task Response score.`
    : wordCount < targetWordCount.min
    ? `NOTE: Word count (${wordCount}) is slightly below the required range of ${targetWordCount.min}-${targetWordCount.max} words (within 10-word tolerance). Minor flexibility is acceptable — do NOT penalize.`
    : wordCount > toleranceAbove
    ? `NOTE: Word count (${wordCount}) significantly exceeds the target range of ${targetWordCount.min}-${targetWordCount.max} words (more than 10 words above maximum). Do NOT deduct marks for exceeding the word limit. However, you MUST mention this in your feedback.`
    : wordCount > targetWordCount.max
    ? `Word count (${wordCount}) is slightly above the target range of ${targetWordCount.min}-${targetWordCount.max} words (within 10-word tolerance). Do NOT deduct marks — just note it in the feedback if relevant.`
    : `Word count (${wordCount}) is within the acceptable range of ${targetWordCount.min}-${targetWordCount.max} words.`;

  const examLabel = targetWordCount.label || 'Foundation Exam';

  const criteriaDetails = rubrics.criteria.map(c => {
    const rubricLevels = Object.entries(c.rubric)
      .map(([score, desc]) => `  Score ${score}: ${desc}`)
      .join('\n');
    return `${c.name} (0-${c.maxScore}):\n${rubricLevels}`;
  }).join('\n\n');

  return `You are an expert writing assessor for Foundation level students at Sultan Qaboos University. CEFR A1-A2 level. Use simple, clear language.

EXAM TYPE: ${examLabel}
${topic ? `Essay Topic: ${topic}` : 'No specific topic provided.'}

Student Essay:
"""
${text}
"""

TARGET WORD COUNT: ${targetWordCount.min}-${targetWordCount.max} words (ideal: ${targetWordCount.ideal}). Tolerance: +/-10 words (${toleranceBelow}-${toleranceAbove}).

${wordCountStatus}

ASSESSMENT RUBRICS (Foundation Courses — FP0230 and FP0340):

${criteriaDetails}

SPECIAL RULES:
${rubrics.specialRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

============================================================
SCORING INSTRUCTIONS:
============================================================

BEFORE SCORING — DIAGNOSE FIRST: For EACH criterion, actively scan the essay for SPECIFIC errors, weaknesses, and strengths. Do NOT give a score until you have identified at least one concrete piece of evidence (a quoted phrase). This prevents generic scoring.

STEP 1 — Score each criterion INDEPENDENTLY using the FULL range (0-6, 0.5 increments). Do NOT default to middle scores (3-3.5). Award HIGH scores (5-6) ONLY if the essay genuinely matches the upper rubric bands. Award LOW scores (1-2) if the essay clearly matches the lower rubric bands. If quality falls between bands, award a half-point.

STEP 2 — For EACH criterion, write a Justification that:
  (a) Names the score band chosen
  (b) Quotes at least ONE exact phrase from the student's essay as evidence
  (c) Explains why the essay fits that band — connect evidence to the rubric
  (d) For Task Response: address topic adherence and essay structure. If the word count exceeds the target, mention it in the feedback but do NOT deduct marks.

STEP 3 — List up to 3 specific errors per criterion in the "mistakes" array. Each mistake MUST have:
  - "quote": the EXACT words from the student's essay that contain the error
  - "explanation": WHY it is wrong (grammar rule broken, wrong word choice, etc.) — do NOT provide corrections
  If you genuinely cannot find any error for a criterion, you may set mistakes to [] — but this should be rare.

STEP 4 — For EACH criterion, write:
  - "strengths": 1-2 specific things the student did well in this criterion (quote evidence)
  - "suggestions": 1-2 specific, actionable improvements for this criterion

STEP 5 — overallFeedback (3-4 sentences): strongest/weakest criterion, word count comment, one prioritized action item.

STEP 6 — totalScore = sum of scores (max ${totalMaxScore}). percentage = round(totalScore / ${totalMaxScore} * 100).

============================================================
CRITICAL OUTPUT RULES:
- Score ALL FOUR criteria. Do NOT omit any.
- Respond with ONLY raw JSON. No markdown, no code fences, no commentary.
- Straight double quotes only. No trailing commas. No smart/curly quotes.
- Use bullet points (•) in justification, strengths, suggestions, and overallFeedback.
- SCORE INDEPENDENTLY: The example JSON below shows FORMAT ONLY — do NOT copy its example scores. Score each criterion based on the actual student text quality against the rubric bands.
- MANDATORY: Every score entry MUST include justification, strengths, mistakes, and suggestions fields.

JSON FORMAT (exactly 4 score entries):
============================================================
{
  "scores": [
    {
      "criterionName": "Task Response",
      "score": 4,
      "maxScore": 6,
      "justification": "Score 4: Good. Addresses the task well. Quote: \\"[exact phrase from essay]\\" shows [rubric alignment].",
      "strengths": "Clearly addresses the topic. Quote: \\"[exact phrase]\\" demonstrates [specific strength].",
      "mistakes": [
        { "quote": "[exact error from essay]", "explanation": "[why wrong, no correction]" },
        { "quote": "[exact error from essay]", "explanation": "[why wrong]" }
      ],
      "suggestions": "Try to [specific actionable improvement] for a higher score."
    },
    {
      "criterionName": "Coherence and Cohesion",
      "score": 3.5,
      "maxScore": 6,
      "justification": "Score 3.5 — Satisfactory to Good. [explanation with quote]",
      "strengths": "[specific strengths with evidence]",
      "mistakes": [
        { "quote": "[exact error]", "explanation": "[why wrong]" }
      ],
      "suggestions": "[specific improvement]"
    }
  ],
  "totalScore": 14,
  "maxScore": ${totalMaxScore},
  "percentage": 58,
  "overallFeedback": "Strongest: [criterion] because [reason]. Weakest: [criterion] because [reason]. [Word count comment]. Focus on: [action]."
}`;
}

// Build prompt for Credit/Post-foundation courses
function buildCreditPrompt(text: string, topic: string | null, wordCount: number): string {
  const criteria = CREDIT_CRITERIA;
  const totalMaxScore = criteria.reduce((sum, c) => sum + c.maxScore, 0);

  return `You are an expert writing assessor for Credit level students at Sultan Qaboos University. CEFR A2-B1 level. Use simple, clear language.

${topic ? `Essay Topic: ${topic}` : 'No specific topic provided.'}

Student Essay:
"""
${text}
"""

WORD COUNT: ${wordCount} words

ASSESSMENT CRITERIA (Credit Course - LANC2160):
${criteria.map(c => `- ${c.name} (0-${c.maxScore}): ${c.description}`).join('\n')}

============================================================
SCORING INSTRUCTIONS:
============================================================

BEFORE SCORING — DIAGNOSE FIRST: For EACH criterion, actively scan the essay for SPECIFIC errors, weaknesses, and strengths. Do NOT give a score until you have identified at least one concrete piece of evidence (a quoted phrase). This prevents generic scoring.

STEP 1 — Score each criterion INDEPENDENTLY using the FULL range (0-5, 0.5 increments). Do NOT default to middle scores (3-3.5). Award HIGH scores (4-5) ONLY if the essay genuinely matches the upper rubric bands. Award LOW scores (1-2) if the essay clearly matches the lower rubric bands. Score based ONLY on how the text aligns with the rubric descriptors. If quality falls between bands, award a half-point.

STEP 2 — For EACH criterion, write a Justification that:
  (a) Names the score band chosen
  (b) Quotes at least ONE exact phrase from the student's essay as evidence
  (c) Explains why the essay fits that band — connect evidence to the rubric

STEP 3 — List up to 3 specific errors per criterion in the "mistakes" array. Each mistake MUST have:
  - "quote": the EXACT words from the student's essay that contain the error
  - "explanation": WHY it is wrong (grammar rule broken, wrong word choice, etc.) — do NOT provide corrections
  If you genuinely cannot find any error for a criterion, you may set mistakes to [] — but this should be rare.

STEP 4 — For EACH criterion, write:
  - "strengths": 1-2 specific things the student did well in this criterion (quote evidence)
  - "suggestions": 1-2 specific, actionable improvements for this criterion

STEP 5 — overallFeedback (3-4 sentences): strongest/weakest criterion, one prioritized action item.

STEP 6 — totalScore = sum of scores (max ${totalMaxScore}). percentage = round(totalScore / ${totalMaxScore} * 100).

============================================================
CRITICAL OUTPUT RULES:
- Respond with ONLY raw JSON. No markdown, no code fences, no commentary.
- Straight double quotes only. No trailing commas. No smart/curly quotes.
- Use bullet points (•) in justification, strengths, suggestions, and overallFeedback.
- SCORE INDEPENDENTLY: The example JSON below shows FORMAT ONLY — do NOT copy its example scores. Score each criterion based on the actual student text quality against the rubric bands.
- MANDATORY: Every score entry MUST include justification, strengths, mistakes, and suggestions fields.

JSON FORMAT:
============================================================
{
  "scores": [
    {
      "criterionName": "Task Achievement",
      "score": 4,
      "maxScore": 5,
      "justification": "Score 4: Good. Achieves the task well. Quote: \\"[exact phrase from essay]\\" shows [criterion alignment].",
      "strengths": "[specific strengths with evidence]",
      "mistakes": [
        { "quote": "[exact error from essay]", "explanation": "[why wrong, no correction]" }
      ],
      "suggestions": "[specific actionable improvement]"
    },
    {
      "criterionName": "Coherence & Cohesion",
      "score": 3,
      "maxScore": 5,
      "justification": "Score 3 — Satisfactory. [explanation with quote]",
      "strengths": "[specific strengths]",
      "mistakes": [
        { "quote": "[exact error]", "explanation": "[why wrong]" }
      ],
      "suggestions": "[specific improvement]"
    }
  ],
  "totalScore": 16,
  "maxScore": ${totalMaxScore},
  "percentage": 80,
  "overallFeedback": "Strongest: [criterion] because [reason]. Weakest: [criterion] because [reason]. Focus on: [action]."
}
`;
}

// Build prompt for Summary Writing (LANC2160)
function buildSummaryPrompt(
  studentText: string,
  sourceText: string,
  sourceTitle: string,
  wordCount: number,
  targetWordCount: { min: number; max: number; ideal: number }
): string {
  const rubrics = SUMMARY_RUBRICS;
  const totalMaxScore = SUMMARY_CRITERIA.reduce((sum, c) => sum + c.maxScore, 0); // 20

  const wordCountStatus = wordCount < 20
    ? `WARNING: Word count (${wordCount}) is BELOW the minimum of 20 words. This MUST significantly lower the Task Achievement score.`
    : wordCount < targetWordCount.min
    ? `WARNING: Word count (${wordCount}) is BELOW the recommended range of ${targetWordCount.min}-${targetWordCount.max} words. The summary should be approximately one-third of the original text length. This should lower the Task Achievement score.`
    : wordCount > targetWordCount.max
    ? `NOTE: Word count (${wordCount}) exceeds the recommended range of ${targetWordCount.min}-${targetWordCount.max} words. Do NOT deduct marks for exceeding the word limit. However, you MUST mention this in the feedback and note that the summary should be concise and approximately one-third of the original text length.`
    : `Word count (${wordCount}) is within the acceptable range of ${targetWordCount.min}-${targetWordCount.max} words.`;

  const criteriaDetails = rubrics.criteria.map(c => {
    const rubricLevels = Object.entries(c.rubric)
      .map(([score, desc]) => `  Score ${score}: ${desc}`)
      .join('\n');
    return `${c.name} (0-${c.maxScore}):\n${rubricLevels}`;
  }).join('\n\n');

  return `You are an expert writing assessor for LANC2160 (Summary Writing) at Sultan Qaboos University. CEFR A2-B1 level. Use simple, clear language.

TASK: The student read the source text and wrote a summary of approximately one-third of the original text length.

SOURCE TEXT:
Title: "${sourceTitle}"
"""
${sourceText}
"""

STUDENT'S SUMMARY:
"""
${studentText}
"""

${wordCountStatus}
Target summary length: ${targetWordCount.min}-${targetWordCount.max} words (approximately one-third of the ${sourceText.trim().split(/\s+/).filter(Boolean).length}-word source text).

SUMMARY WRITING ASSESSMENT RUBRICS (LANC2160 — Summary Writing):

${criteriaDetails}

SUMMARY RULES:
1. Capture MAIN IDEAS only — focus on key points, not minor details.
2. Student must use OWN WORDS (paraphrasing). Copied phrases/sentences lower Task Achievement and Lexical Resource scores.
3. No personal opinions, arguments, or new information not in the source text.
4. Off-topic summary = Task Achievement 0. Large-scale copying = low TA and LR regardless of accuracy.

============================================================
SCORING INSTRUCTIONS:
============================================================

BEFORE SCORING — DIAGNOSE FIRST: For EACH criterion, actively scan the summary for SPECIFIC errors, weaknesses, and strengths. Do NOT give a score until you have identified at least one concrete piece of evidence (a quoted phrase). This prevents generic scoring.

STEP 1 — Score each criterion INDEPENDENTLY using the FULL range (0-5, 0.5 increments). Do NOT default to middle scores (3-3.5). Award HIGH scores (4-5) ONLY if the summary genuinely matches the upper rubric bands. Award LOW scores (1-2) if the summary clearly matches the lower rubric bands. Score based ONLY on how the text aligns with the rubric descriptors. If quality falls between bands, award a half-point.

STEP 2 — For EACH criterion, write a Justification that:
  (a) Names the score band chosen
  (b) Quotes at least ONE exact phrase from the student's summary as evidence
  (c) Explains why the text fits that band — connect evidence to the rubric
  (d) For Task Achievement: address which main ideas were captured, paraphrasing quality, and whether irrelevant details were included

STEP 3 — List up to 3 specific errors per criterion in the "mistakes" array. Each mistake MUST have:
  - "quote": the EXACT words from the student's summary that contain the error
  - "explanation": WHY it is wrong (grammar rule broken, wrong word choice, etc.) — do NOT provide corrections
  If you genuinely cannot find any error for a criterion, you may set mistakes to [] — but this should be rare.

STEP 4 — For EACH criterion, write:
  - "strengths": 1-2 specific things the student did well in this criterion (quote evidence)
  - "suggestions": 1-2 specific, actionable improvements for this criterion

STEP 5 — overallFeedback (3-4 sentences): which main ideas were captured/missed, strongest/weakest criterion, paraphrasing quality, one prioritized action item.

STEP 6 — totalScore = sum of scores (max ${totalMaxScore}). percentage = round(totalScore / ${totalMaxScore} * 100).

============================================================
CRITICAL OUTPUT RULES:
- Respond with ONLY raw JSON. No markdown, no code fences, no commentary.
- Straight double quotes only. No trailing commas. No smart/curly quotes.
- Use bullet points (•) in justification, strengths, suggestions, and overallFeedback.
- SCORE INDEPENDENTLY: The example JSON below shows FORMAT ONLY — do NOT copy its example scores. Score each criterion based on the actual student text quality against the rubric bands.
- MANDATORY: Every score entry MUST include justification, strengths, mistakes, and suggestions fields.

JSON FORMAT:
============================================================
{
  "scores": [
    {
      "criterionName": "Task Achievement",
      "score": 3.5,
      "maxScore": 5,
      "justification": "Score 3.5 — Good achievement. Captures most main ideas. Quote: \\"[exact phrase from summary]\\" shows [rubric alignment]. Paraphrased well in most places.",
      "strengths": "[specific strengths with evidence]",
      "mistakes": [
        { "quote": "[exact error from summary]", "explanation": "[why wrong, no correction]" }
      ],
      "suggestions": "[specific actionable improvement]"
    },
    {
      "criterionName": "Coherence & Cohesion",
      "score": 3,
      "maxScore": 5,
      "justification": "Score 3 — Satisfactory. [explanation with quote]",
      "strengths": "[specific strengths]",
      "mistakes": [
        { "quote": "[exact error]", "explanation": "[why wrong]" }
      ],
      "suggestions": "[specific improvement]"
    }
  ],
  "totalScore": 17,
  "maxScore": ${totalMaxScore},
  "percentage": 85,
  "overallFeedback": "Captures main ideas about [X, Y] but misses [Z]. Strongest: [criterion] because [reason]. Weakest: [criterion] because [reason]. Paraphrasing is [quality]. Focus on: [action]."
}
`;
}

// Synthesis assignments data (defined here to avoid import issues with @/lib/store in server-side route)
// NOTE: Synthesis assignment data is imported dynamically from the store
// to avoid duplicating data and causing ID mismatches between frontend and API.

// Build prompt for LANC1070 Synthesis Essay (single source text)
function buildLanc1070Prompt(
  studentText: string,
  sourceContent: string,
  sourceTitle: string,
  assignmentTitle: string,
  assignmentDescription: string,
  wordCount: number,
  targetWordCount: { min: number; max: number; ideal: number }
): string {
  const rubrics = SYNTHESIS_RUBRICS;
  const totalMaxScore = SYNTHESIS_CRITERIA.reduce((sum, c) => sum + c.maxScore, 0); // 20

  const tenPercentBelow = Math.round(targetWordCount.min * 0.9);
  const tenPercentAbove = Math.round(targetWordCount.max * 1.1);

  const wordCountStatus = wordCount < tenPercentBelow
    ? `WARNING: Word count (${wordCount}) is MORE THAN 10% BELOW the required minimum of ${targetWordCount.min} words. This MUST lower the Task Achievement score per the rubric.`
    : wordCount < targetWordCount.min
    ? `NOTE: Word count (${wordCount}) is below the required range of ${targetWordCount.min}-${targetWordCount.max} words. Up to 10% below is acceptable for the Satisfactory band.`
    : wordCount > tenPercentAbove
    ? `NOTE: Word count (${wordCount}) is MORE THAN 10% ABOVE the required maximum of ${targetWordCount.max} words. Do NOT deduct marks for exceeding the word limit. However, you MUST mention this in your feedback.`
    : wordCount > targetWordCount.max
    ? `NOTE: Word count (${wordCount}) exceeds the recommended range of ${targetWordCount.min}-${targetWordCount.max} words. Do NOT deduct marks — just note it in the feedback if relevant.`
    : `Word count (${wordCount}) is within the acceptable range of ${targetWordCount.min}-${targetWordCount.max} words.`;

  const criteriaDetails = rubrics.criteria.map(c => {
    const rubricLevels = Object.entries(c.rubric)
      .map(([score, desc]) => `  Score ${score}: ${desc}`)
      .join('\n');
    return `${c.name} (0-${c.maxScore}):\n${rubricLevels}`;
  }).join('\n\n');

  return `You are an expert writing assessor for LANC1070 (Synthesis Essay) at Sultan Qaboos University. CEFR A2-B1 level. Use simple, clear language.

ASSIGNMENT: ${assignmentTitle}

WRITING TASK: ${assignmentDescription}

TARGET WORD COUNT: ${targetWordCount.min}-${targetWordCount.max} words (ideal: ${targetWordCount.ideal}). Tolerance: +/-10% (${tenPercentBelow}-${tenPercentAbove}).

${wordCountStatus}

SOURCE TEXT:
Title: "${sourceTitle}"
"""
${sourceContent}
"""

STUDENT'S ESSAY:
"""
${studentText}
"""

ASSESSMENT RUBRICS (LANC1070 — Synthesis Essay, single source):

${criteriaDetails}

POINTS TO CONSIDER:
- TA: Does the essay address the required discussion points? Is source text synthesized? Note: do NOT deduct marks if word count exceeds the target — mention it in feedback only.
- C&C: Logical organization, cohesive devices, paragraphing
- LR: Vocabulary range/accuracy, paraphrasing quality, spelling
- GRA: Grammatical range/accuracy, sentence variety, punctuation

============================================================
SCORING INSTRUCTIONS:
============================================================

BEFORE SCORING — DIAGNOSE FIRST: For EACH criterion, actively scan the essay for SPECIFIC errors, weaknesses, and strengths. Do NOT give a score until you have identified at least one concrete piece of evidence (a quoted phrase). This prevents generic scoring.

STEP 1 — Score each criterion INDEPENDENTLY using the FULL range (0-5, 0.5 increments). Do NOT default to middle scores (3-3.5). Award HIGH scores (4-5) ONLY if the essay genuinely matches the upper rubric bands. Award LOW scores (1-2) if the essay clearly matches the lower rubric bands. Score based ONLY on how the text aligns with the rubric descriptors. If quality falls between bands, award a half-point.

STEP 2 — For EACH criterion, write a Justification that:
  (a) Names the score band chosen
  (b) Quotes at least ONE exact phrase from the student's essay as evidence
  (c) Explains why the essay fits that band — connect evidence to the rubric

STEP 3 — List up to 3 specific errors per criterion in the "mistakes" array. Each mistake MUST have:
  - "quote": the EXACT words from the student's essay that contain the error
  - "explanation": WHY it is wrong (grammar rule broken, wrong word choice, etc.) — do NOT provide corrections
  If you genuinely cannot find any error for a criterion, you may set mistakes to [] — but this should be rare.

STEP 4 — For EACH criterion, write:
  - "strengths": 1-2 specific things the student did well in this criterion (quote evidence)
  - "suggestions": 1-2 specific, actionable improvements for this criterion

STEP 5 — overallFeedback (3-4 sentences): strongest/weakest criterion, how well discussion points were addressed, paraphrasing quality, one prioritized action item.

STEP 6 — totalScore = sum of scores (max ${totalMaxScore}). percentage = round(totalScore / ${totalMaxScore} * 100).

============================================================
CRITICAL OUTPUT RULES:
- Respond with ONLY raw JSON. No markdown, no code fences, no commentary.
- Straight double quotes only. No trailing commas. No smart/curly quotes.
- Use bullet points (•) in justification, strengths, suggestions, and overallFeedback.
- SCORE INDEPENDENTLY: The example JSON below shows FORMAT ONLY — do NOT copy its example scores. Score each criterion based on the actual student text quality against the rubric bands.
- MANDATORY: Every score entry MUST include justification, strengths, mistakes, and suggestions fields.

JSON FORMAT:
============================================================
{
  "scores": [
    {
      "criterionName": "Task Achievement",
      "score": 4,
      "maxScore": 5,
      "justification": "Score 4: Good. Addresses the task well. Quote: \\"[exact phrase from essay]\\" shows [rubric alignment].",
      "strengths": "[specific strengths with evidence]",
      "mistakes": [
        { "quote": "[exact error from essay]", "explanation": "[why wrong, no correction]" }
      ],
      "suggestions": "[specific actionable improvement]"
    },
    {
      "criterionName": "Coherence and Cohesion",
      "score": 3,
      "maxScore": 5,
      "justification": "Score 3 — Satisfactory. [explanation with quote]",
      "strengths": "[specific strengths]",
      "mistakes": [
        { "quote": "[exact error]", "explanation": "[why wrong]" }
      ],
      "suggestions": "[specific improvement]"
    }
  ],
  "totalScore": 16,
  "maxScore": ${totalMaxScore},
  "percentage": 80,
  "overallFeedback": "Strongest: [criterion] because [reason]. Weakest: [criterion] because [reason]. Discussion points: [evaluation]. Focus on: [action]."
}
`;
}

// Build prompt for Synthesis Essay (LANC2160)
function buildSynthesisPrompt(
  studentText: string,
  sources: { title: string; content: string }[],
  assignmentTitle: string,
  assignmentDescription: string,
  wordCount: number,
  targetWordCount: { min: number; max: number; ideal: number }
): string {
  const rubrics = SYNTHESIS_RUBRICS;
  const totalMaxScore = SYNTHESIS_CRITERIA.reduce((sum, c) => sum + c.maxScore, 0); // 20

  const tenPercentBelow = Math.round(targetWordCount.min * 0.9);
  const tenPercentAbove = Math.round(targetWordCount.max * 1.1);

  const wordCountStatus = wordCount < tenPercentBelow
    ? `WARNING: Word count (${wordCount}) is MORE THAN 10% BELOW the required minimum of ${targetWordCount.min} words. This MUST lower the Task Achievement score per the rubric.`
    : wordCount < targetWordCount.min
    ? `NOTE: Word count (${wordCount}) is below the required range of ${targetWordCount.min}-${targetWordCount.max} words. Up to 10% below is acceptable for the Satisfactory band.`
    : wordCount > tenPercentAbove
    ? `NOTE: Word count (${wordCount}) is MORE THAN 10% ABOVE the required maximum of ${targetWordCount.max} words. Do NOT deduct marks for exceeding the word limit. However, you MUST mention this in your feedback.`
    : wordCount > targetWordCount.max
    ? `NOTE: Word count (${wordCount}) exceeds the recommended range of ${targetWordCount.min}-${targetWordCount.max} words. Do NOT deduct marks — just note it in the feedback if relevant.`
    : `Word count (${wordCount}) is within the acceptable range of ${targetWordCount.min}-${targetWordCount.max} words.`;

  const criteriaDetails = rubrics.criteria.map(c => {
    const rubricLevels = Object.entries(c.rubric)
      .map(([score, desc]) => `  Score ${score}: ${desc}`)
      .join('\n');
    return `${c.name} (0-${c.maxScore}):\n${rubricLevels}`;
  }).join('\n\n');

  const sourceTextsBlock = sources.map((s, i) => {
    const wordCountOfSource = s.content.trim().split(/\s+/).filter(Boolean).length;
    return `SOURCE TEXT ${i + 1}:
Title: "${s.title}" (${wordCountOfSource} words)
"""
${s.content}
"""`;
  }).join('\n\n');

  return `You are an expert writing assessor for LANC2160 (Synthesis Essay) at Sultan Qaboos University. CEFR A2-B1 level. Use simple, clear language.

TASK: The student read ALL THREE source texts and wrote a 4-paragraph synthesis essay (${targetWordCount.min}-${targetWordCount.max} words).

ASSIGNMENT: ${assignmentTitle}
INSTRUCTIONS: ${assignmentDescription}

${sourceTextsBlock}

STUDENT'S SYNTHESIS ESSAY:
"""
${studentText}
"""

${wordCountStatus}
Target essay length: ${targetWordCount.min}-${targetWordCount.max} words (ideal: ${targetWordCount.ideal} words).

SYNTHESIS ESSAY ASSESSMENT RUBRICS (LANC2160 — Two-Point Essay Writing Marking Criteria):

${criteriaDetails}

SYNTHESIS RULES:
1. Synthesize ALL THREE source texts — combine information from multiple sources into a coherent whole. Address the assignment prompt "${assignmentTitle}".
2. Student MUST use OWN WORDS (paraphrasing). Copied phrases/sentences lower TA and LR scores. Estimate copying percentage.
3. Structure: exactly 4 paragraphs (intro, body 1, body 2, conclusion). Note deviations in C&C assessment.
4. No personal opinions, arguments, or new information. Off-topic = TA 0. Large-scale copying = low TA and LR regardless of accuracy.
5. Word count: do NOT deduct marks if the word count exceeds the target — mention it in the feedback only. If 10%+ BELOW the target range, this MUST lower TA per rubric bands.

============================================================
SCORING INSTRUCTIONS:
============================================================

BEFORE SCORING — DIAGNOSE FIRST: For EACH criterion, actively scan the synthesis essay for SPECIFIC errors, weaknesses, and strengths. Do NOT give a score until you have identified at least one concrete piece of evidence (a quoted phrase). This prevents generic scoring.

STEP 1 — Score each criterion INDEPENDENTLY using the FULL range (0-5, 0.5 increments). Do NOT default to middle scores (3-3.5). Award HIGH scores (4-5) ONLY if the essay genuinely matches the upper rubric bands. Award LOW scores (1-2) if the essay clearly matches the lower rubric bands. Score based ONLY on how the text aligns with the rubric descriptors. If quality falls between bands, award a half-point.

STEP 2 — For EACH criterion, write a Justification that:
  (a) Names the score band chosen
  (b) Quotes at least ONE exact phrase from the student's essay as evidence
  (c) Explains why the essay fits that band — connect evidence to the rubric
  (d) For Task Achievement: address whether ALL THREE sources were synthesized, assignment prompt addressed, and own words used. If word count exceeds target, mention in feedback but do NOT deduct marks.

STEP 3 — List up to 3 specific errors per criterion in the "mistakes" array. Each mistake MUST have:
  - "quote": the EXACT words from the student's essay that contain the error
  - "explanation": WHY it is wrong (grammar rule broken, wrong word choice, etc.) — do NOT provide corrections
  If you genuinely cannot find any error for a criterion, you may set mistakes to [] — but this should be rare.

STEP 4 — For EACH criterion, write:
  - "strengths": 1-2 specific things the student did well in this criterion (quote evidence)
  - "suggestions": 1-2 specific, actionable improvements for this criterion

STEP 5 — overallFeedback (3-4 sentences): which sources were used (all 3?), strongest/weakest criterion, paraphrasing/copied text percentage, one prioritized action item.

STEP 6 — totalScore = sum of scores (max ${totalMaxScore}). percentage = round(totalScore / ${totalMaxScore} * 100).

============================================================
CRITICAL OUTPUT RULES:
- Respond with ONLY raw JSON. No markdown, no code fences, no commentary.
- Straight double quotes only. No trailing commas. No smart/curly quotes.
- Use bullet points (•) in justification, strengths, suggestions, and overallFeedback.
- SCORE INDEPENDENTLY: The example JSON below shows FORMAT ONLY — do NOT copy its example scores. Score each criterion based on the actual student text quality against the rubric bands.
- MANDATORY: Every score entry MUST include justification, strengths, mistakes, and suggestions fields.

JSON FORMAT:
============================================================
{
  "scores": [
    {
      "criterionName": "Task Achievement",
      "score": 3.5,
      "maxScore": 5,
      "justification": "Score 3.5 — Synthesizes all three sources. Quote: \\"[exact phrase from essay]\\" shows [rubric alignment]. Paraphrased in most places. Word count acceptable.",
      "strengths": "[specific strengths with evidence]",
      "mistakes": [
        { "quote": "[exact error from essay]", "explanation": "[why wrong, no correction]" },
        { "quote": "[exact copied phrase]", "explanation": "Copied directly from source — should be paraphrased" }
      ],
      "suggestions": "[specific actionable improvement]"
    },
    {
      "criterionName": "Coherence and Cohesion",
      "score": 3,
      "maxScore": 5,
      "justification": "Score 3 — Satisfactory. [explanation with quote]",
      "strengths": "[specific strengths]",
      "mistakes": [
        { "quote": "[exact error]", "explanation": "[why wrong]" }
      ],
      "suggestions": "[specific improvement]"
    }
  ],
  "totalScore": 10,
  "maxScore": ${totalMaxScore},
  "percentage": 50,
  "overallFeedback": "Draws on [X of 3] source texts. Strongest: [criterion] because [reason]. Weakest: [criterion] because [reason]. Copied text ~[X]%. Focus on: [action]."
}
`;
}

/**
 * Robustly extract a JSON object from LLM output that may be:
 *  - Wrapped in markdown code fences (```json ... ```)
 *  - Preceded or followed by conversational text
 *  - Containing control characters or BOM markers
 *  - Truncated (incomplete JSON due to token limit)
 *  - Using smart quotes instead of straight quotes
 */
function extractJSON(raw: string): any {
  let text = raw.trim();

  // Remove BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Remove markdown code fences
  text = text.replace(/```json\s*/gi, '');
  text = text.replace(/```\s*/g, '');

  // Replace smart/curly quotes with straight quotes (LLMs often produce these)
  text = text.replace(/[\u2018\u2019]/g, "'");   // ' → '
  text = text.replace(/[\u201C\u201D]/g, '"');   // " → "

  // Find the first '{' and last '}' to extract just the JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  // Remove control characters (except newline, tab, carriage return)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Attempt 1: Direct parse
  try {
    return JSON.parse(text);
  } catch (_e) {
    // continue to cleanup
  }

  // Attempt 2: Remove trailing commas (common LLM artifact)
  // Remove commas before } or ] (with optional whitespace)
  let cleaned = text.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    // continue
  }

  // Attempt 3: Fix unescaped quotes in string values
  // This handles cases where the LLM puts unescaped double quotes inside strings
  cleaned = attemptFixUnescapedQuotes(cleaned);

  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    // continue
  }

  // Attempt 4: If all else fails, try to extract using a bracket-matching approach
  const extracted = extractJsonObject(cleaned);
  if (extracted) {
    return JSON.parse(extracted);
  }

  throw new Error('Could not extract valid JSON from AI response');
}

/**
 * Attempt to fix unescaped double quotes inside JSON string values.
 * This is a best-effort heuristic — not a full JSON parser.
 */
function attemptFixUnescapedQuotes(json: string): string {
  const result: string[] = [];
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < json.length) {
    const ch = json[i];

    if (escaped) {
      result.push(ch);
      escaped = false;
      i++;
      continue;
    }

    if (ch === '\\') {
      result.push(ch);
      escaped = true;
      i++;
      continue;
    }

    if (ch === '"') {
      if (inString) {
        // Check if the next non-whitespace char looks like it's outside a string
        // (i.e., it's a JSON structural character)
        const afterStr = json.substring(i + 1).trimStart();
        const nextChar = afterStr[0];
        if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === undefined) {
          // This quote ends the string — normal JSON behavior
          inString = false;
        } else {
          // This quote is likely an unescaped quote inside the string — escape it
          result.push('\\"');
          i++;
          continue;
        }
      } else {
        inString = true;
      }
      result.push(ch);
      i++;
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join('');
}

/**
 * Extract a JSON object by finding balanced braces from the first '{'.
 * Returns the substring from first '{' to its matching '}'.
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inStr) {
      escaped = true;
      continue;
    }

    if (ch === '"' && !escaped) {
      inStr = !inStr;
      continue;
    }

    if (!inStr) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.substring(start, i + 1);
        }
      }
    }
  }

  // If we got here, JSON is truncated — try to close it manually
  if (depth > 0) {
    let partial = text.substring(start);
    // Remove any trailing incomplete key/value
    partial = partial.replace(/,\s*"[^"]*"\s*:?\s*$/, '');
    // Add closing braces
    while (depth > 0) {
      partial += '}';
      depth--;
    }
    // Try to fix any trailing issues
    partial = partial.replace(/,\s*([\]}])/g, '$1');
    try {
      JSON.parse(partial);
      return partial;
    } catch (_e) {
      // still broken
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request: expected JSON body.', details: 'The request body could not be parsed as JSON.' },
        { status: 400 }
      );
    }
    const { text, courseCode, topic, examType, writingType, sourceTextId } = body;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'No text provided for assessment', details: 'The text field is empty or missing from the request.' },
        { status: 400 }
      );
    }

    // API key is read from server-side environment variable only
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY environment variable is not set.', details: 'The server-side GEMINI_API_KEY environment variable is missing or empty.' },
        { status: 500 }
      );
    }

    // Calculate word count
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    // Determine course type and build appropriate prompt
    const isFoundation = ['0230', '0340'].includes(courseCode);
    const isSummaryWriting = courseCode === 'LANC2160' && writingType === 'summary';
    const isSynthesisWriting = courseCode === 'LANC2160' && writingType === 'synthesis';
    const isLanc1070 = courseCode === 'LANC1070';
    const isLanc2146 = courseCode === 'LANC2146';

    // Validate that LANC2160 has a writingType selected
    if (courseCode === 'LANC2160' && !writingType) {
      return NextResponse.json(
        { error: 'Writing type is required for LANC2160. Please select either "Summary" or "Synthesis" before assessing.', details: 'Missing writingType parameter for LANC2160' },
        { status: 400 }
      );
    }

    // Validate that courses requiring a sourceTextId have one provided
    if ((isLanc1070 || isLanc2146 || isSummaryWriting || isSynthesisWriting) && !sourceTextId) {
      return NextResponse.json(
        { error: 'A source text or assignment must be selected before assessment. Please go back and select one.', details: `Missing sourceTextId for course ${courseCode}` },
        { status: 400 }
      );
    }

    // Resolve target word count based on exam type (for FP0340) or summary target
    let activeTargetWordCount: { min: number; max: number; ideal: number; label?: string } | null = null;
    let prompt: string;
    let criteria: any[];

    if (isFoundation) {
      // Foundation courses (FP0230, FP0340) — per-course word count targets
      const courseWordCounts = FOUNDATION_WORD_COUNTS[courseCode];
      const courseDefault = DEFAULT_FOUNDATION_WORD_COUNTS[courseCode];
      if (examType && courseWordCounts && courseWordCounts[examType]) {
        activeTargetWordCount = courseWordCounts[examType];
      } else if (courseDefault) {
        activeTargetWordCount = { ...courseDefault };
      } else {
        activeTargetWordCount = { min: 110, max: 130, ideal: 120, label: 'Foundation Exam' };
      }
      prompt = buildFoundationPrompt(text, topic, wordCount, activeTargetWordCount);
      criteria = FOUNDATION_RUBRICS.criteria;
    } else if (isSummaryWriting) {
      // Summary Writing for LANC2160 — look up source text
      const { SUMMARY_SOURCE_TEXTS } = await import('@/lib/store');
      const sourceTextData = SUMMARY_SOURCE_TEXTS.find(s => s.id === sourceTextId);
      
      if (!sourceTextData) {
        return NextResponse.json(
          { error: 'Source text not found. Please select a valid source text for summary writing.', details: `No source text found for sourceTextId: ${sourceTextId}` },
          { status: 400 }
        );
      }
      
      activeTargetWordCount = {
        min: sourceTextData.targetMin,
        max: sourceTextData.targetMax,
        ideal: sourceTextData.targetIdeal,
        label: `Summary of "${sourceTextData.title}"`
      };
      prompt = buildSummaryPrompt(text, sourceTextData.originalText, sourceTextData.title, wordCount, activeTargetWordCount);
      criteria = SUMMARY_CRITERIA;
    } else if (isSynthesisWriting) {
      // Synthesis Essay for LANC2160 — look up assignment by sourceTextId (import from store to stay in sync)
      const { SYNTHESIS_ASSIGNMENTS } = await import('@/lib/store');
      const assignmentData = SYNTHESIS_ASSIGNMENTS.find(a => a.id === sourceTextId);
      
      if (!assignmentData) {
        return NextResponse.json(
          { error: 'Synthesis assignment not found. Please select a valid assignment for synthesis essay writing.', details: `No synthesis assignment found for sourceTextId: ${sourceTextId}` },
          { status: 400 }
        );
      }
      
      activeTargetWordCount = {
        min: assignmentData.targetWordCount.min,
        max: assignmentData.targetWordCount.max,
        ideal: assignmentData.targetWordCount.ideal,
        label: `Synthesis: "${assignmentData.title}"`
      };
      prompt = buildSynthesisPrompt(
        text,
        assignmentData.sources.map(s => ({ title: s.title, content: s.content })),
        assignmentData.title,
        assignmentData.description,
        wordCount,
        activeTargetWordCount
      );
      criteria = SYNTHESIS_CRITERIA;
    } else if (isLanc2146) {
      // LANC2146 Report Writing — Discussion & Conclusion
      const { LANC2146_PRACTICE_TESTS } = await import('@/lib/store');
      const practiceData = LANC2146_PRACTICE_TESTS.find(t => t.id === sourceTextId);

      if (!practiceData) {
        return NextResponse.json(
          { error: 'Report writing assignment not found. Please select a valid practice test.', details: `No LANC2146 practice test found for sourceTextId: ${sourceTextId}` },
          { status: 400 }
        );
      }

      activeTargetWordCount = {
        min: practiceData.targetWordCount.min,
        max: practiceData.targetWordCount.max,
        ideal: practiceData.targetWordCount.ideal,
        label: `Report: "${practiceData.title}"`
      };
      prompt = buildLanc2146Prompt(
        text,
        practiceData.reportSections.map(s => ({ title: s.title, content: s.content })),
        practiceData.resultsFigure?.caption || null,
        practiceData.resultsFigure?.graphDescription || null,
        practiceData.title,
        wordCount,
        activeTargetWordCount
      );
      criteria = LANC2146_CRITERIA;
    } else if (isLanc1070) {
      // LANC1070 Synthesis Essay — single source text practice tests
      const { LANC1070_PRACTICE_TESTS } = await import('@/lib/store');
      const practiceData = LANC1070_PRACTICE_TESTS.find(t => t.id === sourceTextId);

      if (!practiceData) {
        return NextResponse.json(
          { error: 'LANC1070 practice test not found. Please select a valid practice test.', details: `No LANC1070 practice test found for sourceTextId: ${sourceTextId}` },
          { status: 400 }
        );
      }

      activeTargetWordCount = {
        min: practiceData.targetWordCount.min,
        max: practiceData.targetWordCount.max,
        ideal: practiceData.targetWordCount.ideal,
        label: `LANC1070: "${practiceData.title}"`
      };
      prompt = buildLanc1070Prompt(
        text,
        practiceData.sourceText.content,
        practiceData.sourceText.title,
        practiceData.title,
        practiceData.description,
        wordCount,
        activeTargetWordCount
      );
      criteria = SYNTHESIS_CRITERIA; // Reuse synthesis criteria (A2-B1, 0-5 scale)
    } else {
      // Credit/Post-foundation — general
      activeTargetWordCount = null;
      prompt = buildCreditPrompt(text, topic, wordCount);
      criteria = CREDIT_CRITERIA;
    }

    // 1. Initialize Official Google Gemini SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 2. Initialize Model with Strict Instructions
    const systemInstruction = isSummaryWriting
      ? 'You are an expert writing assessment AI for the Credit level course LANC2160 (Academic English: Summary Writing & Synthesis Essay) at Sultan Qaboos University. For summary writing tasks, students are at CEFR A2-B1 level. Your feedback must use simple, clear language appropriate for this proficiency level. CRITICAL: You MUST (1) compare the student summary against the provided source text, (2) quote exact words from the student summary as evidence, (3) explicitly justify why the score matches the rubric band, (4) list specific errors with quoted text, (5) assess paraphrasing quality, and (6) give actionable suggestions. You respond only with valid JSON. No markdown formatting or code blocks.'
      : isSynthesisWriting
      ? 'You are an expert writing assessment AI for the Credit level course LANC2160 (Academic English: Summary Writing & Synthesis Essay) at Sultan Qaboos University. For synthesis essay tasks, students are at CEFR A2-B1 level. Your feedback must use simple, clear language appropriate for this proficiency level. CRITICAL: You MUST (1) compare the student essay against ALL THREE provided source texts, (2) check that information from all sources is synthesized, (3) quote exact words from the student essay as evidence, (4) explicitly justify why the score matches the rubric band, (5) list specific errors with quoted text, (6) assess paraphrasing quality and estimate copying percentage, (7) check word count against the target range, and (8) give actionable suggestions. You respond only with valid JSON. No markdown formatting or code blocks.'
      : isLanc1070
      ? 'You are an expert writing assessment AI for the Credit level course LANC1070 (Academic English) at Sultan Qaboos University. For synthesis essay tasks based on a single source text, students are at CEFR A2-B1 level. Your feedback must use simple, clear language appropriate for this proficiency level. CRITICAL: You MUST (1) compare the student essay against the provided source text, (2) check that the student addresses the required discussion points, (3) quote exact words from the student essay as evidence, (4) explicitly justify why the score matches the rubric band, (5) list specific errors with quoted text, (6) assess paraphrasing quality and estimate copying percentage, (7) check word count against the target range, and (8) give actionable suggestions. You respond only with valid JSON. No markdown formatting or code blocks.'
      : isLanc2146
      ? 'You are an expert writing assessment AI for the Credit level course LANC2146 (Report Writing) at Sultan Qaboos University. For lab report Discussion and Conclusion tasks, students are at CEFR A2-B1 level. Your feedback must use simple, clear language appropriate for this proficiency level. CRITICAL: You MUST (1) evaluate the Discussion section for analysis and interpretation of data with details/examples/statistics, (2) evaluate the Conclusion for summary of results, reference to previous research, restatement of aim, and recommendations, (3) quote exact words from the student text as evidence, (4) explicitly justify why the score matches the rubric band, (5) list specific errors with quoted text, (6) check word count against the target range specified in the prompt, and (7) give actionable suggestions. You respond only with valid JSON. No markdown formatting or code blocks.'
      : isFoundation
      ? 'You are an expert writing assessment AI for Foundation level courses (FP0230, FP0340) at Sultan Qaboos University. Foundation students are at CEFR A1-A2 level (Beginner to Elementary). Your feedback must use very simple, clear language appropriate for this proficiency level. CRITICAL: You MUST (1) actively scan for specific grammar, vocabulary, cohesion, and task-related errors in the essay, (2) quote exact words from the student essay as evidence for EVERY score and feedback point, (3) explicitly justify why the score matches the rubric band descriptor, (4) list specific errors with quoted text in the mistakes array for each criterion, (5) identify genuine strengths with evidence, and (6) give actionable suggestions. Use the FULL score range (0-6) — do NOT default to middle scores. You respond only with valid JSON. No markdown formatting or code blocks.'
      : 'You are an expert writing assessment AI for university courses at Sultan Qaboos University. Students are at CEFR A2-B1 level (Elementary to Pre-Intermediate). Your feedback must use simple, clear language appropriate for this proficiency level. Focus on fundamental skills and provide encouraging, constructive guidance. CRITICAL: For each criterion you MUST (1) quote exact words from the student essay as evidence, (2) explicitly justify why the score matches the rubric band, (3) list specific errors with quoted text, and (4) give actionable suggestions. You respond only with valid JSON. No markdown formatting or code blocks.';

    // Model tiers: try gemini-2.0-flash first (fast, non-thinking), fall back to
    // gemini-2.5-flash if unavailable. Both configured with responseMimeType for
    // reliable JSON output and temperature 0.1 for consistent scoring.
    const MODEL_TIERS = ['gemini-2.0-flash', 'gemini-2.5-flash'];

    // 3. Generate Content
    //    Using gemini-2.0-flash (primary) with gemini-2.5-flash fallback.
    //    responseMimeType: 'application/json' forces valid JSON output.
    //    temperature: 0.1 for consistent, deterministic scoring.
    //
    //    SAFETY: Lower safety thresholds to prevent student essay content
    //    (e.g., essays about smoking, pollution, social issues) from being
    //    blocked by Gemini's default safety filters.
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ];

    // Retry configuration for rate-limit errors (429 / RESOURCE_EXHAUSTED)
    const RATE_LIMIT_RETRIES = 3;
    const RATE_LIMIT_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s

    // Try generation with model fallback and increasing token limits on truncation
    let responseText = '';
    let parsedOk = false;
    // NOTE: Gemini free tier caps maxOutputTokens at 8192. Start there to avoid
    // API errors on free-tier keys. If response is truncated, retry at 16384
    // (which works on paid tiers and will be silently capped on free tier).
    const tokenLimits = [8192, 16384];

    // Outer loop: try primary model first, fall back to next tier
    modelTierLoop: for (let modelTierIndex = 0; modelTierIndex < MODEL_TIERS.length; modelTierIndex++) {
      const model = genAI.getGenerativeModel({
        model: MODEL_TIERS[modelTierIndex],
        systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          // For gemini-2.5-flash: disable thinking to avoid 3-8s reasoning overhead
          // on Vercel free tier. gemini-2.0-flash ignores this (non-thinking model).
          ...(MODEL_TIERS[modelTierIndex].startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      });

      for (const maxTokens of tokenLimits) {
        // Inner retry loop for rate-limit (429) errors
        for (let rateLimitAttempt = 0; rateLimitAttempt < RATE_LIMIT_RETRIES; rateLimitAttempt++) {
          try {
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json',
            },
            safetySettings,
          });

          // ── Check for prompt-level blocking ──
          const promptFeedback = (result.response as any)?.promptFeedback;
          if (promptFeedback?.blockReason) {
            const reason = promptFeedback.blockReason;
            console.error(`Gemini prompt blocked: ${reason}`);
            return NextResponse.json(
              { error: 'AI content filter blocked the submission. Please try rephrasing your essay or contact your instructor.', details: `Prompt blocked: ${reason}` },
              { status: 422 }
            );
          }

          // ── Check for response-level blocking / truncation ──
          const candidate = (result.response as any)?.candidates?.[0];
          const finishReason = candidate?.finishReason;

          // SAFETY / RECITATION / LANGUAGE — content is blocked entirely
          if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'LANGUAGE') {
            console.error(`Gemini response blocked, finishReason: ${finishReason}`);
            return NextResponse.json(
              { error: 'AI content filter blocked the assessment response. This may happen if the essay discusses sensitive topics. Please try rephrasing or contact your instructor.', details: `Response blocked: ${finishReason}` },
              { status: 422 }
            );
          }

          // Extract text — filter out any thought parts (safety for future model upgrades)
          let rawText = '';
          if (candidate?.content?.parts) {
            // Filter out thought parts and concatenate only text parts
            for (const part of candidate.content.parts) {
              if (part.text && !part.thought) {
                rawText += part.text;
              }
            }
          }
          // Fallback to the SDK's text() method if manual extraction failed
          if (!rawText) {
            rawText = result.response?.text?.() || '';
          }
          if (!rawText || rawText.trim().length === 0) {
            console.error('Gemini returned empty response. finishReason:', finishReason);
            return NextResponse.json(
              { error: 'AI returned an empty response. Please try again.', details: `Empty response, finishReason: ${finishReason || 'unknown'}` },
              { status: 500 }
            );
          }

          // MAX_TOKENS — response is truncated, may cause JSON parse failure
          if (finishReason === 'MAX_TOKENS') {
            console.warn(`Response truncated at ${maxTokens} tokens, attempting to parse anyway...`);
          }

          // Try to parse the JSON and validate structure
          let assessment: any = null;
          let parseFailed = false;
          try {
            assessment = extractJSON(rawText);
          } catch (_e) {
            parseFailed = true;
            // JSON parse failed — if truncated, break to try next token limit
            if (finishReason === 'MAX_TOKENS' && maxTokens !== tokenLimits[tokenLimits.length - 1]) {
              console.warn(`JSON parse failed after truncation at ${maxTokens} tokens, retrying with higher limit...`);
              break; // Break out of rate-limit loop to try next token limit
            }
            // Otherwise, fall through to error
            console.error('Failed to parse assessment response. Raw text (first 500 chars):', rawText.substring(0, 500));
            return NextResponse.json(
              { error: 'Failed to parse AI assessment response. The AI returned an invalid format. Please try again.', details: 'The AI response could not be parsed. This is a temporary issue — retrying usually works.' },
              { status: 500 }
            );
          }

          // Validate structure: must have a scores array
          if (assessment && assessment.scores && Array.isArray(assessment.scores)) {
            responseText = rawText;
            parsedOk = true;
            break;
          }

          // JSON parsed but structure invalid (no scores array) — treat as parse failure
          console.error('Assessment JSON parsed but has no valid scores array. Raw text (first 500 chars):', rawText.substring(0, 500));
          if (finishReason === 'MAX_TOKENS' && maxTokens !== tokenLimits[tokenLimits.length - 1]) {
            console.warn('Truncated response missing scores array, retrying with higher token limit...');
            break; // Break to try next token limit
          }
          return NextResponse.json(
            { error: 'AI returned an invalid assessment structure. Please try again.', details: 'No scores array in response.' },
            { status: 500 }
          );

        } catch (genError: any) {
          const errMsg = genError?.message || String(genError);
          const isRateLimit =
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('quota') ||
            errMsg.includes('rate') && errMsg.includes('limit');

          // If rate-limited and we have retries left, wait and retry
          if (isRateLimit && rateLimitAttempt < RATE_LIMIT_RETRIES - 1) {
            const delay = RATE_LIMIT_DELAYS[rateLimitAttempt];
            console.warn(`Rate limit hit (attempt ${rateLimitAttempt + 1}/${RATE_LIMIT_RETRIES}), retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // retry inner loop
          }

          // If rate-limited and out of retries
          if (isRateLimit) {
            console.error(`Rate limit exhausted for ${MODEL_TIERS[modelTierIndex]} after all retries.`);
            if (modelTierIndex < MODEL_TIERS.length - 1) {
              console.warn(`Falling back to ${MODEL_TIERS[modelTierIndex + 1]}...`);
              break modelTierLoop; // Skip to next model tier immediately
            }
            // All model tiers exhausted
            return NextResponse.json(
              { error: 'Gemini API rate limit reached. Your free tier has a limited number of requests per minute. Please wait 1-2 minutes and try again. Tip: Add a second Gemini API key in Settings (one for OCR, one for assessment) to double your quota.', details: errMsg },
              { status: 429 }
            );
          }

          // Non-rate-limit error: if this is the last token limit attempt
          if (maxTokens === tokenLimits[tokenLimits.length - 1]) {
            if (modelTierIndex < MODEL_TIERS.length - 1) {
              console.warn(`Model ${MODEL_TIERS[modelTierIndex]} error, falling back to ${MODEL_TIERS[modelTierIndex + 1]}...`);
              break modelTierLoop; // Skip to next model tier immediately
            }
            throw genError; // All model tiers exhausted
          }
          console.warn(`Generation error with ${maxTokens} tokens:`, errMsg);
          break; // break inner loop, try next token limit
        }
      }

        if (parsedOk) break;
      }
      if (parsedOk) break;
    }

    if (!parsedOk) {
      return NextResponse.json(
        { error: 'Failed to get a valid assessment from the AI after multiple attempts. Please try again.', details: 'All token limit attempts and rate-limit retries exhausted without a valid response.' },
        { status: 500 }
      );
    }

    // Parse the JSON response with aggressive cleanup
    let assessment;
    try {
      assessment = extractJSON(responseText);
    } catch (parseError) {
      console.error('Failed to parse assessment response. Raw text:', responseText.substring(0, 500));
      console.error('Parse error:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse AI assessment response', details: 'The AI returned an invalid response. Please try again.' },
        { status: 500 }
      );
    }

    // Validate the assessment structure
    if (!assessment.scores || !Array.isArray(assessment.scores)) {
      return NextResponse.json(
        { error: 'Invalid assessment structure', details: 'The parsed assessment JSON does not contain a valid scores array.' },
        { status: 500 }
      );
    }

    // Ensure all criteria are assessed
    const assessedCriteria = assessment.scores.map((s: any) => s.criterionName);
    const missingCriteria = criteria.filter(c => !assessedCriteria.includes(c.name));
    
    if (missingCriteria.length > 0) {
      missingCriteria.forEach(c => {
        assessment.scores.push({
          criterionName: c.name,
          score: 0,
          maxScore: c.maxScore,
          justification: 'Unable to assess this criterion from the provided text.',
          strengths: '',
          mistakes: [],
          suggestions: 'Unable to provide suggestions.',
          feedback: 'Unable to assess this criterion from the provided text.'
        });
      });
    }

    // Normalize scores: allow 0.5 increments, round to nearest 0.5, clamp to [0, maxScore]
    assessment.scores.forEach((s: any) => {
      const rawScore = Number(s.score) || 0;
      s.maxScore = Math.round(Number(s.maxScore) || 0);
      // Round to nearest 0.5 and clamp between 0 and maxScore
      s.score = Math.max(0, Math.min(Math.round(rawScore * 2) / 2, s.maxScore));

      // Strip markdown from Gemini-returned fields before building feedback.
      // Coerces non-string values (arrays, objects) to strings first to prevent
      // "e.replace is not a function" runtime errors when the model returns
      // unexpected types for these fields.
      const clean = (val: any): string => {
        if (val == null) return '';
        let str: string;
        if (typeof val === 'string') {
          str = val;
        } else if (Array.isArray(val)) {
          // Model returned an array of strings — join with bullet points
          str = val.map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' • ');
        } else {
          // Object or other — stringify
          str = JSON.stringify(val);
        }
        return str
          .replace(/\*\*/g, '')           // Remove bold markers
          .replace(/\*(?!\*)/g, '')        // Remove italic markers
          .replace(/^#+\s+/gm, '')         // Remove heading markers
          .replace(/^---+$/gm, '')         // Remove horizontal rules
          .trim();
      };

      s.strengths = clean(s.strengths);
      s.justification = clean(s.justification);
      s.suggestions = clean(s.suggestions);

      // Ensure strengths, mistakes, and suggestions are never empty
      // This prevents the UI from silently hiding these sections
      if (!s.strengths) {
        s.strengths = 'No specific strengths identified for this criterion.';
      }
      if (!s.suggestions) {
        s.suggestions = 'No specific suggestions for this criterion.';
      }
      if (!Array.isArray(s.mistakes) || s.mistakes.length === 0) {
        s.mistakes = [{ quote: '', explanation: 'No specific mistakes identified for this criterion.' }];
      }

      // Clean mistakes array items
      if (Array.isArray(s.mistakes)) {
        s.mistakes = s.mistakes.map((m: any) => {
          if (typeof m === 'string') {
            // Strip leading "- " or "* " list markers
            let cleaned = m.replace(/^[\-\*]\s+/, '').trim();
            // Remove surrounding quotes
            cleaned = cleaned.replace(/^["\u201C\u201D]/, '').replace(/["\u201C\u201D]$/, '');
            // Remove em-dash and replace with colon separator
            cleaned = cleaned.replace(/\s*[—\-]\s*/, ': ').trim();
            return cleaned;
          } else {
            // Object format: { quote, explanation, text, reason }
            const quote = clean(typeof m.quote === 'string' ? m.quote : (m.text || ''));
            const explanation = clean(typeof m.explanation === 'string' ? m.explanation : (m.reason || ''));
            return { quote, explanation };
          }
        }).filter((m: any) => {
          if (typeof m === 'string') return m.length > 0;
          return m.quote || m.explanation;
        });
      }

      // Build a clean, professional feedback string with section headers
      // These headers are required by parseFeedback() in scoring-utils.ts
      // to reliably identify each section (avoids fragile heuristic parsing)
      const parts: string[] = [];

      if (s.justification) {
        parts.push(`Justification: ${s.justification}`);
      }
      if (s.strengths) {
        parts.push(`Strengths: ${s.strengths}`);
      }
      if (Array.isArray(s.mistakes) && s.mistakes.length > 0) {
        const mistakeLines = s.mistakes
          .map((m: any) => {
            if (typeof m === 'string') return `- \"${m}\"`;
            return m.quote ? `- \"${m.quote}\": ${m.explanation}` : `- ${m.explanation}`;
          })
          .join('\n');
        parts.push(`Mistakes found:\n${mistakeLines}`);
      }
      if (s.suggestions) {
        parts.push(`Suggestions: ${s.suggestions}`);
      }

      // Use the clean structured string, fallback to raw feedback
      if (parts.length > 0) {
        s.feedback = parts.join('\n\n');
      } else if (s.feedback) {
        // If no structured fields, clean the raw feedback
        s.feedback = clean(s.feedback);
      } else {
        s.feedback = 'No feedback provided.';
      }
    });

    // Recalculate total score to ensure accuracy
    // Use integer math to avoid floating-point precision issues with 0.5 increments
    // e.g., 3.5 + 2.5 + 4.0 + 3.0 = 13.0 (not 12.999999...)
    assessment.totalScore = Math.round(
      assessment.scores.reduce((sum: number, s: any) => sum + s.score, 0) * 2
    ) / 2;
    assessment.maxScore = assessment.scores.reduce((sum: number, s: any) => sum + s.maxScore, 0);
    assessment.percentage = assessment.maxScore > 0 ? Math.round((assessment.totalScore / assessment.maxScore) * 100) : 0;

    // Clean overallFeedback from any markdown residue
    if (assessment.overallFeedback != null) {
      if (typeof assessment.overallFeedback === 'string') {
        assessment.overallFeedback = assessment.overallFeedback
          .replace(/\*\*/g, '')
          .replace(/\*(?!\*)/g, '')
          .replace(/^#+\s+/gm, '')
          .replace(/^---+$/gm, '')
          .trim();
      } else if (Array.isArray(assessment.overallFeedback)) {
        assessment.overallFeedback = assessment.overallFeedback
          .map((item: any) => (typeof item === 'string' ? item : JSON.stringify(item)))
          .join(' ');
      } else {
        assessment.overallFeedback = String(assessment.overallFeedback);
      }
      if (!assessment.overallFeedback) {
        assessment.overallFeedback = 'No overall feedback provided.';
      }
    }

    // Add word count info
    assessment.wordCount = wordCount;
    assessment.targetWordCount = (isFoundation || isSummaryWriting || isSynthesisWriting || isLanc1070 || isLanc2146) ? activeTargetWordCount : null;

    return NextResponse.json({
      success: true,
      assessment: {
        ...assessment,
        createdAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Assessment error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    // Provide more specific error messages for common Gemini API failures
    let userError = 'Failed to assess essay';
    if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID') || msg.includes('invalid API key')) {
      userError = 'Gemini API key is invalid. Please check the GEMINI_API_KEY environment variable on the server.';
    } else if (msg.includes('model not found') || msg.includes('does not exist') || msg.includes('MODEL_NOT_FOUND')) {
      userError = 'The AI model is currently unavailable. Please try again later.';
    } else if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      userError = 'Gemini API quota exceeded. Please wait a few minutes and try again.';
    } else if (msg.includes('PERMISSION_DENIED') || msg.includes('forbidden')) {
      userError = 'Gemini API access denied. The API key may not have permission to use this model.';
    } else if (msg.includes('timeout') || msg.includes('TIMEOUT') || msg.includes('Function exceeded time limits') || msg.includes('504') || msg.includes('ECONNRESET') || msg.includes('socket hang up')) {
      userError = 'Assessment timed out. The AI took too long to respond. This can happen on the free plan for complex assignments. Please try again.';
    }
    return NextResponse.json(
      { error: userError, details: msg },
      { status: 500 }
    );
  }
}
