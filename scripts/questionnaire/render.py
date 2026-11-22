#!/usr/bin/env python3
"""Render public/questionnaire.pdf from questionnaire.html.

The questionnaire is a WeasyPrint document (68.1). Edit the HTML here, never the
PDF: this script is the only way the PDF gets made, so the copy on the site and
the copy in the repo stay the same thing.

usage: python3 scripts/questionnaire/render.py   (pip install weasyprint==68.1)
"""
import os
import weasyprint
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', '..', 'public', 'questionnaire.pdf')
weasyprint.HTML(os.path.join(here, 'questionnaire.html'), base_url=here).write_pdf(out)
print('wrote', os.path.normpath(out))
