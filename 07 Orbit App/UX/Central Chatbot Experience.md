# Central Chatbot Experience

Ask Orbit Axis is the central product action.

The chat opens as a full workspace rather than a small floating support bubble. The header shows:

- Orbit Axis
- the active chart label
- back control
- conversation history control
- new conversation control

Technical Ollama and local model diagnostics were moved to:

More -> Settings -> Local Intelligence

The welcome state includes a soft orbit illustration and suggested prompts:

- Explain my Big Three
- What does today’s Moon mean for me?
- What does my Venus sign mean?
- Compare me with someone
- Explain Mercury retrograde
- Give me a tarot reflection
- What house rules relationships?
- What does this transit mean?

The chat uses the existing Local Intelligence endpoint. It should not invent deterministic chart placements, transits, aspects, or Moon data; those remain owned by the calculation engine.
