import json
import sys

from argostranslate import translate

request = json.load(sys.stdin)
try:
    translated = translate.translate(request["sourceText"], request["sourceLanguage"], request["targetLanguage"])
    print(json.dumps({"translatedText": translated, "version": "argos-translate-en-tr-v1"}))
except Exception as error:
    print(json.dumps({"error": str(error)}))
    raise
