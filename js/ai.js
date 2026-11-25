// Tâches pédagogiques confiées à Gemini : lecture des notes, génération, comparaison, correction.

import { generate } from './gemini.js';
import { paragraphsForPrompt } from './text.js';
import { LANGUAGES } from './util.js';

const S = (type, extra = {}) => ({ type, ...extra });

// ---------- Lecture d'une photo de notes ----------
export async function transcribeImage({ base64, mimeType }) {
  return generate({
    system: 'Tu es un outil de transcription fidèle de notes de cours.',
    temperature: 0.1,
    parts: [
      { inline_data: { mime_type: mimeType, data: base64 } },
      {
        text: [
          'Transcris fidèlement tout le texte de cette page de notes (manuscrite ou imprimée).',
          'Conserve les titres, listes, formules et la langue d\'origine.',
          'Sépare les paragraphes par une ligne vide.',
          'Si la page contient un schéma ou un graphique, décris-le brièvement entre crochets : [Schéma : …].',
          'Écris [illisible] pour un mot que tu ne peux pas lire. Ne corrige pas le fond, n\'ajoute aucun commentaire.',
          'Renvoie uniquement le texte transcrit.',
        ].join('\n'),
      },
    ],
  });
}

// ---------- Génération des cartes ----------
const CARDS_SCHEMA = S('OBJECT', {
  properties: {
    cards: S('ARRAY', {
      items: S('OBJECT', {
        properties: {
          type: S('STRING', { enum: ['qa', 'cloze', 'mcq', 'why'] }),
          concept: S('STRING'),
          question: S('STRING'),
          answer: S('STRING'),
          shortAnswer: S('STRING'),
          explanation: S('STRING'),
          hint: S('STRING'),
          distractors: S('ARRAY', {
            items: S('OBJECT', { properties: { text: S('STRING'), why: S('STRING') }, required: ['text', 'why'] }),
          }),
          sourceIds: S('ARRAY', { items: S('STRING') }),
          quote: S('STRING'),
        },
        required: ['type', 'concept', 'question', 'answer', 'shortAnswer', 'explanation', 'hint', 'distractors', 'sourceIds', 'quote'],
      }),
    }),
  },
  required: ['cards'],
});

const DIFFICULTY = {
  facile: 'facile : rappel direct d\'une information des notes',
  moyen: 'moyenne : reformulation et compréhension',
  difficile: 'difficile : application à un cas, lien entre deux notions',
};

const FORMAT_RULES = {
  qa: '- "qa" : définition, date, fait ou exercice de calcul (pour un calcul, demande de refaire le calcul et donne le résultat).',
  cloze: '- "cloze" : une phrase tirée des notes où le ou les mots clés sont remplacés par ____ ; "answer" contient les mots manquants.',
  mcq: '- "mcq" : deux notions proches (ex. coût marginal / coût moyen) : la question porte sur l\'une, et l\'autre figure parmi les distracteurs.',
  why: '- "why" : concept ou mécanisme : question « Pourquoi … ? » ou « Explique avec tes mots … ». "distractors" peut être vide.',
};

/**
 * @param {object} o
 * @param {Array} o.paragraphs paragraphes [{id,page,text}] des notes retenues
 * @param {number} o.count nombre de questions
 * @param {string} o.difficulty facile|moyen|difficile
 * @param {string} o.language code langue
 * @param {string[]} o.formats formats autorisés
 * @param {string} [o.focus] consigne libre de l'étudiant
 * @param {string[]} [o.existing] questions déjà créées (à ne pas répéter)
 */
export async function generateCards({ paragraphs, count, difficulty, language, formats, focus, existing = [] }) {
  const lang = LANGUAGES[language] || 'Français';
  const system = [
    'Tu es un assistant pédagogique qui crée des questions de révision à partir des notes de cours d\'un étudiant.',
    'Règles impératives :',
    '1. Utilise UNIQUEMENT les informations présentes dans les notes. N\'ajoute aucun fait extérieur.',
    '2. Une question = une notion. Couvre les notions importantes, sans doublon.',
    '3. Choisis le format selon le contenu, parmi ceux autorisés :',
    ...formats.map((f) => FORMAT_RULES[f]),
    '4. "answer" : réponse complète tirée des notes. "shortAnswer" : la même en quelques mots, utilisable comme choix de QCM.',
    '5. "distractors" : 3 mauvaises réponses plausibles, de même forme que shortAnswer, de préférence des notions voisines présentes dans les notes ; "why" explique en une phrase pourquoi chacune est fausse.',
    '6. "explanation" : 2 à 4 phrases qui disent pourquoi la bonne réponse est juste, en s\'appuyant sur les notes.',
    '7. "quote" : copie MOT POUR MOT une ou deux phrases des notes qui justifient la réponse.',
    '8. "sourceIds" : identifiants [pX] des paragraphes utilisés.',
    '9. "hint" : un indice qui oriente sans donner la réponse.',
    '10. "concept" : le nom court de la notion (2 à 5 mots).',
    `11. Rédige les questions et réponses en ${lang.toLowerCase()}.`,
    `12. Difficulté ${DIFFICULTY[difficulty] || DIFFICULTY.moyen}.`,
  ].join('\n');

  const prompt = [
    `Crée exactement ${count} questions.`,
    focus ? `Consigne de l'étudiant : ${focus}` : '',
    existing.length ? `Questions déjà existantes, à ne pas répéter :\n${existing.slice(0, 60).map((q) => `- ${q}`).join('\n')}` : '',
    'Notes (chaque paragraphe est précédé de son identifiant) :',
    paragraphsForPrompt(paragraphs),
  ].filter(Boolean).join('\n\n');

  const data = await generate({ system, parts: [{ text: prompt }], schema: CARDS_SCHEMA, temperature: 0.5 });
  return (data.cards || []).filter((c) => c.question && c.answer && formats.includes(c.type));
}

// ---------- Comparaison de la réponse rédigée avec les notes ----------
const COMPARE_SCHEMA = S('OBJECT', {
  properties: {
    verdict: S('STRING', { enum: ['correct', 'partiel', 'incorrect'] }),
    feedback: S('STRING'),
    missing: S('ARRAY', { items: S('STRING') }),
    errors: S('ARRAY', { items: S('STRING') }),
    improvedAnswer: S('STRING'),
  },
  required: ['verdict', 'feedback', 'missing', 'errors', 'improvedAnswer'],
});

export async function compareWithNotes({ question, studentAnswer, passages, language }) {
  const lang = LANGUAGES[language] || 'Français';
  return generate({
    system: [
      'Tu compares la réponse qu\'un étudiant a rédigée avec ses propres notes de cours.',
      'Juge le fond, pas le style ni l\'orthographe. Une formulation différente mais exacte est correcte.',
      '"missing" : éléments importants des notes absents de la réponse. "errors" : affirmations contraires aux notes.',
      '"improvedAnswer" : garde les mots de l\'étudiant et ajoute seulement ce qui manque ou corrige ce qui est faux.',
      '"feedback" : 1 à 3 phrases, bienveillantes et précises.',
      `Réponds en ${lang.toLowerCase()}.`,
    ].join('\n'),
    parts: [{ text: `Question : ${question}\n\nRéponse de l'étudiant : ${studentAnswer}\n\nPassages des notes :\n${passages}` }],
    schema: COMPARE_SCHEMA,
    temperature: 0.2,
  });
}

// ---------- Correction pendant la révision ----------
const GRADE_SCHEMA = S('OBJECT', {
  properties: {
    correct: S('BOOLEAN'),
    score: S('NUMBER'),
    feedback: S('STRING'),
  },
  required: ['correct', 'score', 'feedback'],
});

export async function gradeAnswer({ question, expected, given, passages, language }) {
  const lang = LANGUAGES[language] || 'Français';
  return generate({
    system: [
      'Tu corriges une réponse donnée pendant une séance de révision.',
      'La réponse attendue a été rédigée par l\'étudiant et vérifiée sur ses notes.',
      'La réponse est juste ("correct": true) si elle contient l\'essentiel de la réponse attendue, même formulée autrement. Ignore l\'orthographe.',
      '"score" entre 0 et 1 mesure la part de l\'essentiel retrouvée.',
      '"feedback" : 1 à 3 phrases : ce qui est juste, puis ce qui manque ou est faux.',
      `Réponds en ${lang.toLowerCase()}.`,
    ].join('\n'),
    parts: [{ text: `Question : ${question}\n\nRéponse attendue : ${expected}\n\nPassage des notes : ${passages}\n\nRéponse donnée : ${given}` }],
    schema: GRADE_SCHEMA,
    temperature: 0.1,
  });
}
