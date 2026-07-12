import re


class Sentence:
    def __init__(self, text):
        self.text = text


class Document:
    def __init__(self, text):
        self.sentences = [Sentence(value.strip()) for value in re.split(r"(?<=[.!?])\\s+", text) if value.strip()]


class Pipeline:
    # Argos only needs sentence boundaries for the installed CTranslate2 package.
    def __init__(self, **_kwargs):
        pass

    def __call__(self, text):
        return Document(text)
