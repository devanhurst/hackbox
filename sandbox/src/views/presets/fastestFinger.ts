export default `{
  "theme": {
    "header": {
      "color": "black",
      "background": "#FAA516",
      "fontFamily": "monospace"
    },
    "main": {
      "background": "#111"
    }
  },
  "presets": {
    "Question": {
      "type": "Text",
      "props": {
        "style": {
          "color": "white",
          "background": "black",
          "border": "4px solid #7391CA",
          "fontFamily": "Roboto Condensed"
        }
      }
    },
    "Answers": {
      "type": "Choices",
      "props": {
        "multiSelect": true,
        "style": {
          "align": "start",
          "color": "white",
          "background": "black",
          "border": "2px solid #7391CA",
          "hover": {
            "background": "#FAA516",
            "color": "black"
          }
        },
        "submit": {
          "label": "Final answer?",
          "style": {
            "align": "center",
            "fontFamily": "Roboto Condensed",
            "background": "#FAA516",
            "color": "black",
            "hover": {
              "background": "#0BDA51",
              "color": "white"
            }
          }
        }
      }
    }
  },
  "ui": {
    "header": {
      "text": "REGIS"
    },
    "main": {
      "align": "start",
      "components": [
        {
          "type": "Question",
          "props": {
            "text": "Starting with the most popular, put these **Google Fonts** in order by the number of downloads."
          }
        },
        {
          "type": "Answers",
          "props": {
            "choices": [
              {
                "label": "**A:** Open Sans",
                "value": "A",
                "keys": ["A", "1"],
                "style": {
                  "fontFamily": "Open Sans"
                }
              },
              {
                "label": "**B:** Montserrat",
                "value": "B",
                "keys": ["B", "2"],
                "style": {
                  "fontFamily": "Montserrat"
                }
              },
              {
                "label": "**C:** Raleway",
                "value": "C",
                "keys": ["C", "3"],
                "style": {
                  "fontFamily": "Raleway"
                }
              },
              {
                "label": "**D:** Ubuntu",
                "value": "D",
                "keys": ["D", "4"],
                "style": {
                  "fontFamily": "Ubuntu"
                }
              }
            ]
          }
        }
      ]
    }
  }
}`;
