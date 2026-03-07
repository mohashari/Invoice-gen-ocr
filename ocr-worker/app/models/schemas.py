from pydantic import BaseModel
from typing import Optional, List


class OcrJobPayload(BaseModel):
    invoiceId: str
    rawFileUrl: str
    mimeType: str


class LineItemSchema(BaseModel):
    description: Optional[str] = None
    quantity: Optional[float] = None
    unitPrice: Optional[float] = None
    total: Optional[float] = None


class InvoiceDataSchema(BaseModel):
    invoiceNumber: Optional[str] = None
    vendorName: Optional[str] = None
    vendorAddress: Optional[str] = None
    issueDate: Optional[str] = None
    dueDate: Optional[str] = None
    currency: str = "IDR"
    subtotal: Optional[float] = None
    taxAmount: Optional[float] = None
    totalAmount: Optional[float] = None
    paymentTerms: Optional[str] = None
    notes: Optional[str] = None


class OcrCallbackPayload(BaseModel):
    invoiceId: str
    status: str  # done | failed
    errorMsg: Optional[str] = None
    confidence: Optional[float] = None
    invoiceData: Optional[dict] = None
    lineItems: Optional[List[dict]] = None
