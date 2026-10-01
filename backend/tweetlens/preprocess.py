"""The text pipeline shared by Naive Bayes, logistic regression, the neural net,
and the emotion and irony readers.

Every stage works on a list of tokens with stable ids, and records what it did
(removed, morphed, split, fused). The frontend's Pipeline X-Ray replays that
trace, so what the user sees is exactly what the models are fed.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from functools import lru_cache

import emoji
import wordsegment

wordsegment.load()


@dataclass
class Token:
    id: str
    text: str
    kind: str  # url | mention | hashtag | emoji | emoticon | word | punct
    post_negator: bool = False  # Hinglish "nahi" negates the word before it

    def as_dict(self) -> dict:
        return {"id": self.id, "text": self.text, "kind": self.kind}


@dataclass
class StageRecord:
    key: str
    title: str
    description: str
    tokens: list[Token]
    removed: list[str] = field(default_factory=list)
    morphed: list[str] = field(default_factory=list)
    split: dict[str, list[str]] = field(default_factory=dict)
    fused: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "title": self.title,
            "description": self.description,
            "tokens": [t.as_dict() for t in self.tokens],
            "removed": self.removed,
            "morphed": self.morphed,
            "split": self.split,
            "fused": self.fused,
            "changed": bool(self.removed or self.morphed or self.split or self.fused),
        }


# --------------------------------------------------------------------------
# Tokenizer
# --------------------------------------------------------------------------

EMOTICONS = {
    ":'(": "crying_face",
    ":-)": "smiling_face",
    ":-(": "frowning_face",
    ":-D": "grinning_face",
    ":-P": "face_with_tongue",
    ":-p": "face_with_tongue",
    ":-/": "confused_face",
    ";-)": "winking_face",
    ":)": "smiling_face",
    ":]": "smiling_face",
    "=)": "smiling_face",
    ":(": "frowning_face",
    ":[": "frowning_face",
    "=(": "frowning_face",
    ":D": "grinning_face",
    "xD": "grinning_squinting_face",
    "XD": "grinning_squinting_face",
    ":P": "face_with_tongue",
    ":p": "face_with_tongue",
    ":/": "confused_face",
    ";)": "winking_face",
    ":o": "surprised_face",
    ":O": "surprised_face",
    ":*": "kissing_face",
    ":|": "neutral_face",
    "<3": "red_heart",
    "</3": "broken_heart",
    "^_^": "smiling_face",
    "-_-": "expressionless_face",
    "T_T": "crying_face",
}

_emoticon_alt = "|".join(re.escape(e) for e in sorted(EMOTICONS, key=len, reverse=True))

TOKEN_RE = re.compile(
    rf"""
    (?P<url>(?:https?://|www\.)\S+)
  | (?P<mention>@\w+)
  | (?P<hashtag>\#\w+)
  | (?<![\w])(?P<emoticon>{_emoticon_alt})(?![\w])
  | (?P<word>\w+(?:['’]\w+)*)
  | (?P<punct>(?P<pc>[^\w\s])(?P=pc)*)
    """,
    re.VERBOSE | re.UNICODE,
)


def tokenize(text: str) -> list[Token]:
    """Split a tweet into tokens, keeping emojis, URLs, mentions, hashtags and
    emoticons whole."""
    tokens: list[Token] = []
    pos = 0
    counter = 0

    def emit(segment: str) -> None:
        nonlocal counter
        for m in TOKEN_RE.finditer(segment):
            kind = m.lastgroup
            if kind is None:
                continue
            # The inner backreference group for punct is unnamed; lastgroup is
            # the named group that matched.
            for name in ("url", "mention", "hashtag", "emoticon", "word", "punct"):
                if m.group(name):
                    kind = name
                    break
            tokens.append(Token(f"t{counter}", m.group(0), kind))
            counter += 1

    for found in emoji.emoji_list(text):
        start, end = found["match_start"], found["match_end"]
        emit(text[pos:start])
        tokens.append(Token(f"t{counter}", found["emoji"], "emoji"))
        counter += 1
        pos = end
    emit(text[pos:])
    return tokens


# --------------------------------------------------------------------------
# Word lists
# --------------------------------------------------------------------------

NEGATORS = {
    "not", "no", "never", "nothing", "nobody", "none", "nor", "neither",
    "nowhere", "cannot", "without", "hardly", "barely",
}

CLAUSE_BREAKERS = {"but", "however", "although", "though", "yet", "except"}

# A curated list: the usual function words, minus anything that carries tone
# (negators, intensifiers like "very" and "too", and words such as "well").
STOPWORDS = {
    "a", "an", "the", "and", "or", "if", "then", "so", "as", "of", "at", "by",
    "for", "with", "about", "against", "between", "into", "through", "during",
    "before", "after", "above", "below", "to", "from", "in", "out", "on", "off",
    "over", "under", "again", "further", "once", "here", "there", "when",
    "where", "why", "how", "all", "any", "both", "each", "other", "some",
    "such", "own", "same", "than", "s", "t", "can", "will", "just", "now",
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
    "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she",
    "her", "hers", "herself", "it", "its", "itself", "they", "them", "their",
    "theirs", "themselves", "what", "which", "who", "whom", "this", "that",
    "these", "those", "am", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having", "do", "does", "did", "doing", "would",
    "should", "could", "shall", "might", "must", "may", "up", "down", "also",
    "us", "im", "ive", "id", "ill", "u", "ur", "via", "amp", "user",
    "but", "however", "although", "though", "yet", "while", "because",
    # Hinglish function words
    "hai", "hain", "tha", "thi", "the", "ho", "hoga", "ka", "ki", "ke", "ko",
    "se", "mein", "yeh", "ye", "woh", "wo", "kya", "aur", "toh", "to",
    "bhi", "yaar", "yar", "bhai", "na", "aaj", "ek", "kar", "karo",
    "raha", "rahi", "rahe", "gaya", "gayi", "aa", "tum", "aap", "hum",
}

KEEP_PUNCT = {"!", "?"}

# Hinglish (romanised Hindi) words that carry sentiment, mapped to the English
# word the models learned from. Chosen to avoid collisions with English words.
HINGLISH = {
    "acha": "good", "accha": "good", "achha": "good", "achhi": "good",
    "achhe": "good", "acchi": "good", "acche": "good", "badhiya": "great",
    "badiya": "great", "zabardast": "awesome", "jabardast": "awesome",
    "mast": "great", "kamaal": "amazing", "kamal": "amazing",
    "shandaar": "splendid", "shandar": "splendid", "behtareen": "excellent",
    "khush": "happy", "khushi": "happiness", "pyaar": "love", "pyar": "love",
    "maza": "fun", "mazaa": "fun", "majaa": "fun", "sahi": "right",
    "shukriya": "thanks", "dhanyavad": "thanks", "dhanyawad": "thanks",
    "bura": "bad", "buri": "bad", "bure": "bad", "bekar": "useless",
    "bekaar": "useless", "bakwas": "rubbish", "bakwaas": "rubbish",
    "ghatiya": "awful", "faltu": "useless",
    "ganda": "dirty", "gandi": "dirty", "galat": "wrong", "gussa": "angry",
    "dukh": "sadness", "dukhi": "sad", "udaas": "sad", "udas": "sad",
    "pareshan": "troubled", "barbaad": "wasted", "barbad": "wasted",
    "bahut": "very", "bohot": "very", "bohut": "very", "bilkul": "totally",
    "ekdum": "totally", "thoda": "slightly", "paisa": "money", "khana": "food",
    "dost": "friend", "sabse": "most",
}

HINGLISH_NEGATORS = {"nahi", "nahin", "nhi", "nai"}

# Contractions: the first part keeps the original token's place.
CONTRACTIONS = {
    "can't": ["can", "not"], "cant": ["can", "not"], "cannot": ["can", "not"],
    "won't": ["will", "not"], "wont": ["will", "not"],
    "ain't": ["is", "not"], "aint": ["is", "not"],
    "shan't": ["shall", "not"],
    "dont": ["do", "not"], "doesnt": ["does", "not"], "didnt": ["did", "not"],
    "isnt": ["is", "not"], "arent": ["are", "not"], "wasnt": ["was", "not"],
    "werent": ["were", "not"], "havent": ["have", "not"], "hasnt": ["has", "not"],
    "hadnt": ["had", "not"], "couldnt": ["could", "not"],
    "shouldnt": ["should", "not"], "wouldnt": ["would", "not"],
    "i'm": ["i", "am"], "let's": ["let", "us"], "y'all": ["you", "all"],
}

SUFFIXES = [
    ("n't", "not"), ("'re", "are"), ("'ve", "have"), ("'ll", "will"),
    ("'d", "would"), ("'m", "am"), ("'s", ""),
]


# --------------------------------------------------------------------------
# Stages
# --------------------------------------------------------------------------

def _stage_remove_links(tokens: list[Token]) -> StageRecord:
    keep, removed = [], []
    for t in tokens:
        if t.kind in ("url", "mention") or t.text.lower() == "rt":
            removed.append(t.id)
        else:
            keep.append(t)
    return StageRecord(
        "links",
        "Links and mentions removed",
        "URLs, @usernames and retweet marks say who and where, not how anyone feels.",
        keep,
        removed=removed,
    )


def _emoji_name(char: str) -> str:
    name = emoji.demojize(char, delimiters=("", ""))
    name = re.sub(r"_(light|medium-light|medium|medium-dark|dark)_skin_tone", "", name)
    name = name.replace("-", "_").replace(" ", "_").lower()
    return name


def _stage_emojis(tokens: list[Token]) -> StageRecord:
    out, morphed = [], []
    for t in tokens:
        # Converted emojis keep kind "emoji": they end a negation scope the way
        # punctuation does, and later stages leave their names alone.
        if t.kind == "emoji":
            out.append(Token(t.id, _emoji_name(t.text), "emoji"))
            morphed.append(t.id)
        elif t.kind == "emoticon":
            out.append(Token(t.id, EMOTICONS[t.text], "emoji"))
            morphed.append(t.id)
        else:
            out.append(t)
    return StageRecord(
        "emojis",
        "Emojis become words",
        "Each emoji and emoticon is replaced by its name, so the models can weigh it like a word.",
        out,
        morphed=morphed,
    )


_CAMEL_RE = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")


def split_hashtag(tag: str) -> list[str]:
    body = tag.lstrip("#")
    if not body:
        return []
    if not body.isascii():
        return [body]
    has_lower = any(c.islower() for c in body)
    has_upper = any(c.isupper() for c in body)
    if has_lower and has_upper:
        parts = _CAMEL_RE.findall(body)
        if parts:
            return parts
    pieces = wordsegment.segment(body)
    return pieces or [body.lower()]


def _stage_hashtags(tokens: list[Token]) -> StageRecord:
    out, morphed, split, removed = [], [], {}, []
    for t in tokens:
        if t.kind != "hashtag":
            out.append(t)
            continue
        parts = split_hashtag(t.text)
        if not parts:
            removed.append(t.id)
            continue
        if len(parts) == 1:
            out.append(Token(t.id, parts[0], "word"))
            morphed.append(t.id)
            continue
        ids = [t.id] + [f"{t.id}.{i}" for i in range(1, len(parts))]
        out.extend(Token(i, p, "word") for i, p in zip(ids, parts))
        split[t.id] = ids
    return StageRecord(
        "hashtags",
        "Hashtags split apart",
        "#NeverAgain becomes never and again. Capitals mark the breaks; otherwise a word-frequency model finds them.",
        out,
        removed=removed,
        morphed=morphed,
        split=split,
    )


_SQUEEZE_RE = re.compile(r"(.)\1{2,}")


def _stage_lowercase(tokens: list[Token]) -> StageRecord:
    out, morphed = [], []
    for t in tokens:
        text = t.text.lower().replace("’", "'")
        if t.kind == "punct":
            text = t.text[0]
        elif t.kind == "emoji":
            text = t.text
        else:
            text = _SQUEEZE_RE.sub(r"\1\1", text)
        if text != t.text:
            morphed.append(t.id)
        out.append(Token(t.id, text, t.kind))
    return StageRecord(
        "lowercase",
        "Lowercased, stretched words squeezed",
        "GREAT and great become one word. Soooo shrinks to soo and !!! to !, keeping a trace of the stretch.",
        out,
        morphed=morphed,
    )


def expand_contraction(word: str) -> list[str] | None:
    if word in CONTRACTIONS:
        return CONTRACTIONS[word]
    for suffix, replacement in SUFFIXES:
        if word.endswith(suffix) and len(word) > len(suffix):
            stem = word[: -len(suffix)]
            if suffix == "n't" and stem == "ca":
                stem = "can"
            if suffix == "n't" and stem == "wo":
                stem = "will"
            return [stem, replacement] if replacement else [stem]
    return None


def _stage_contractions(tokens: list[Token]) -> StageRecord:
    out, morphed, split = [], [], {}
    for t in tokens:
        parts = expand_contraction(t.text) if t.kind == "word" else None
        if not parts:
            out.append(t)
            continue
        if len(parts) == 1:
            out.append(Token(t.id, parts[0], "word"))
            morphed.append(t.id)
            continue
        ids = [t.id] + [f"{t.id}.c{i}" for i in range(1, len(parts))]
        out.extend(Token(i, p, "word") for i, p in zip(ids, parts))
        split[t.id] = ids
    return StageRecord(
        "contractions",
        "Contractions expanded",
        "Don't becomes do not, so every negation looks the same to the next stage.",
        out,
        morphed=morphed,
        split=split,
    )


def _stage_hinglish(tokens: list[Token]) -> StageRecord:
    out, morphed = [], []
    for t in tokens:
        if t.kind == "word" and t.text in HINGLISH_NEGATORS:
            out.append(Token(t.id, "not", "word", post_negator=True))
            morphed.append(t.id)
        elif t.kind == "word" and t.text in HINGLISH:
            out.append(Token(t.id, HINGLISH[t.text], "word"))
            morphed.append(t.id)
        else:
            out.append(t)
    return StageRecord(
        "hinglish",
        "Hinglish words translated",
        f"{len(HINGLISH)} common romanised Hindi words map to English, such as bakwas to rubbish and nahi to not. "
        "Hindi puts nahi after the word it negates, so it looks backwards in the next stage.",
        out,
        morphed=morphed,
    )


def _is_content(t: Token) -> bool:
    return (
        t.kind == "word"
        and t.text not in STOPWORDS
        and t.text not in NEGATORS
        and t.text not in CLAUSE_BREAKERS
    )


def _stage_negation(tokens: list[Token], scope: int = 3) -> StageRecord:
    """Fuse each negator into the content words it governs: "not good" becomes
    NOT_good. The scope ends at punctuation, at "but"-like words, or after
    `scope` content words."""
    marked: dict[int, str] = {}  # token index -> negator id it fused with (first only)
    fused: dict[str, str] = {}
    dropped: set[int] = set()
    n = len(tokens)
    for i, t in enumerate(tokens):
        if t.kind != "word" or t.text not in NEGATORS:
            continue
        targets: list[int] = []
        if t.post_negator:
            j = i - 1
            while j >= 0 and tokens[j].kind == "word" and not _is_content(tokens[j]) \
                    and tokens[j].text not in NEGATORS:
                j -= 1
            if j >= 0 and _is_content(tokens[j]) and j not in marked:
                targets = [j]
        else:
            j = i + 1
            while j < n and len(targets) < scope:
                tj = tokens[j]
                if tj.kind in ("punct", "emoji") or tj.text in CLAUSE_BREAKERS or tj.text in NEGATORS:
                    break
                if _is_content(tj) and j not in marked:
                    targets.append(j)
                j += 1
        if not targets:
            continue
        for k in targets:
            marked[k] = t.id
        fused[t.id] = tokens[targets[0]].id
        dropped.add(i)

    out, morphed = [], []
    for i, t in enumerate(tokens):
        if i in dropped:
            continue
        if i in marked:
            out.append(Token(t.id, f"NOT_{t.text}", t.kind))
            morphed.append(t.id)
        else:
            out.append(t)
    return StageRecord(
        "negation",
        "Negation fused",
        "A negator joins the words it governs, up to the next punctuation or but: not happy becomes NOT_happy, "
        "a different word from happy.",
        out,
        morphed=morphed,
        fused=fused,
    )


def _stage_stopwords(tokens: list[Token]) -> StageRecord:
    keep, removed = [], []
    for t in tokens:
        if t.kind == "punct":
            if t.text in KEEP_PUNCT:
                keep.append(t)
            else:
                removed.append(t.id)
        elif t.text in STOPWORDS:
            removed.append(t.id)
        else:
            keep.append(t)
    return StageRecord(
        "stopwords",
        "Stopwords and most punctuation removed",
        "Words like the, is and of carry little tone and are dropped. ! and ? stay, because they do carry tone.",
        keep,
        removed=removed,
    )


STAGE_TITLES = [
    ("raw", "Raw tweet"),
    ("links", "Links and mentions removed"),
    ("emojis", "Emojis become words"),
    ("hashtags", "Hashtags split apart"),
    ("lowercase", "Lowercased, stretched words squeezed"),
    ("contractions", "Contractions expanded"),
    ("hinglish", "Hinglish words translated"),
    ("negation", "Negation fused"),
    ("stopwords", "Stopwords and most punctuation removed"),
]


def normalise_input(text: str) -> str:
    text = html.unescape(text or "")
    text = text.replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", text).strip()


def trace(text: str) -> list[StageRecord]:
    """Run the full pipeline and return every stage, raw tweet first."""
    tokens = tokenize(normalise_input(text))
    stages = [
        StageRecord(
            "raw",
            "Raw tweet",
            "The tweet exactly as written, split into tokens.",
            tokens,
        )
    ]
    for step in (
        _stage_remove_links,
        _stage_emojis,
        _stage_hashtags,
        _stage_lowercase,
        _stage_contractions,
        _stage_hinglish,
        _stage_negation,
        _stage_stopwords,
    ):
        stages.append(step(stages[-1].tokens))
    return stages


@lru_cache(maxsize=65536)
def clean(text: str) -> str:
    """The model input: the final stage's tokens joined by spaces."""
    return " ".join(t.text for t in trace(text)[-1].tokens)


def clean_many(texts) -> list[str]:
    return [clean(t if isinstance(t, str) else "") for t in texts]
