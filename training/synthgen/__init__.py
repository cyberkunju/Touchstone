"""
synthgen — multi-category synthetic document generator.

Produces realistic, auto-labelled document images for training the universal
YOLOv11n document-PRIMITIVE detector (and downstream eval). Every element is
placed by us, so we emit pixel-perfect YOLO labels for free.

Universality is by construction: the same primitive renderers are composed into
many document categories (passport/ID, invoice/receipt, form, certificate,
bank statement, license, label, ...), so the detector learns primitives across
contexts rather than one document type.
"""

__version__ = "0.1.0"
