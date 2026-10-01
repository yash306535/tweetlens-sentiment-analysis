from tweetlens.preprocess import clean, split_hashtag, tokenize, trace


def texts(stage):
    return [t.text for t in stage.tokens]


def stage(text, key):
    return next(s for s in trace(text) if s.key == key)


def test_tokenizer_keeps_tweet_units_whole():
    tokens = tokenize("RT @user loved it 😂 :) #NeverAgain https://t.co/x don't!!!")
    kinds = {t.text: t.kind for t in tokens}
    assert kinds["@user"] == "mention"
    assert kinds["😂"] == "emoji"
    assert kinds[":)"] == "emoticon"
    assert kinds["#NeverAgain"] == "hashtag"
    assert kinds["https://t.co/x"] == "url"
    assert kinds["don't"] == "word"
    assert kinds["!!!"] == "punct"


def test_emoticon_inside_url_is_not_split_out():
    assert [t.kind for t in tokenize("see https://x.co/a:)b")] == ["word", "url"]


def test_links_and_mentions_are_removed():
    s = stage("RT @united where is my bag https://t.co/abc", "links")
    assert texts(s) == ["where", "is", "my", "bag"]
    assert len(s.removed) == 3


def test_emojis_become_their_names():
    s = stage("great 👍🏽 :(", "emojis")
    assert texts(s) == ["great", "thumbs_up", "frowning_face"]
    assert len(s.morphed) == 2


def test_hashtags_split_on_capitals_and_on_word_frequencies():
    assert split_hashtag("#NeverAgain") == ["Never", "Again"]
    assert split_hashtag("#happybirthday") == ["happy", "birthday"]
    s = stage("so #GoodVibesOnly", "hashtags")
    assert texts(s) == ["so", "Good", "Vibes", "Only"]
    (parent, children), = s.split.items()
    assert children[0] == parent and len(children) == 3


def test_lowercase_squeezes_stretched_words_and_punctuation():
    assert texts(stage("SOOOO goooood!!!", "lowercase")) == ["soo", "good", "!"]


def test_contractions_expand():
    assert texts(stage("I don't think they can't, dont you?", "contractions")) == [
        "i", "do", "not", "think", "they", "can", "not", ",", "do", "not", "you", "?",
    ]


def test_negation_fuses_forward_until_punctuation():
    assert clean("not happy, honestly") == "NOT_happy honestly"
    assert clean("i do not like this movie at all") == "NOT_like NOT_movie"


def test_negation_stops_at_but_and_at_emoji():
    assert clean("not good but fine") == "NOT_good fine"
    assert clean("not 😂 funny") == "not face_with_tears_of_joy funny"


def test_hinglish_negation_looks_backwards():
    s = stage("Service bilkul achhi nahi thi", "negation")
    assert "NOT_good" in texts(s)
    assert clean("Service bilkul achhi nahi thi") == "service totally NOT_good"


def test_hinglish_words_translate():
    assert clean("movie ekdum bakwas thi yaar") == "movie totally rubbish"


def test_stopwords_go_but_exclamation_and_question_marks_stay():
    assert clean("this is the best!!! right?") == "best ! right ?"


def test_trace_ids_are_consistent_between_stages():
    stages = trace("RT @u I don't love #MondayMornings 😩 sooo much!!! www.x.com")
    for before, after in zip(stages, stages[1:]):
        before_ids = {t.id for t in before.tokens}
        after_ids = [t.id for t in after.tokens]
        assert len(after_ids) == len(set(after_ids)), after.key
        children = {c for kids in after.split.values() for c in kids}
        for token_id in after_ids:
            assert token_id in before_ids or token_id in children, (after.key, token_id)
        for token_id in after.removed:
            assert token_id in before_ids and token_id not in after_ids
        for negator, target in after.fused.items():
            assert negator in before_ids and negator not in after_ids and target in after_ids


def test_empty_and_whitespace_input():
    assert clean("") == ""
    assert clean("   ") == ""
    assert texts(trace("")[0]) == []
