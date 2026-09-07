# AI-OllamaPromptHelper
Simple Web based UI which uses Ollama to support in Prompt generation

Vibe Coded 

# Requirements
* easy to use
* can simply be used in browser
* uses ollama web api and langchain
* loads configuration from a json file
    * ollama url, credentials optional
    *  preset folder
    * output folders
* supports multiple presets, which can be simple selected/switched via dropdown
* loads presets from a json file
    * system prompt 
    * model
    * thinking (yes, no)
    * prompt identifier
* presets can be modified in the ui
* there is a "topic" text field where the user can specify what these prompts about. this will be used for teh prompt result markdown
* user has a fixed input field on the bottom
* user can use an image as additional input (multimodal model support)
* user chat messages and llm responses are showed in a scrollable chat history
* user can select with a checkbox each message he has send and which was returned by teh ai for being part of teh chat history or not (default true)
* there is an option to deseclet all messages
* there is an option to delet individual messages (dosent matter if from user or llm)
* there is an option to save and load a chat history (json)
* "thinking" of the lmm can be turned on and off as part of the preset setting
* "thinking" is showed differently than the response
* in the presets there can be a prompt identifier be configured
    * if there is a prompt identifier, detected prompts will be extracted in a markdown file (one file per topic)
    * the markdown will have for each prompt
        short description, type of prompt (video, image, text), prompt text, section for feedback 
