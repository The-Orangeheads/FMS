import fitz
import pdfplumber
import pandas as pd
from typing import List, Tuple, Optional, Dict

class PDFTextHandler:
    def __init__(self, complexity_threshold: int = 10):
        self.complexity_threshold = complexity_threshold
        self._pending_table_df: Optional[pd.DataFrame] = None 

    def calculate_page_complexity(self, page: fitz.Page) -> int:
        
        return 0

    def _df_to_markdown(self, df: pd.DataFrame) -> str:
        if df.empty: return ""
        df = df.replace(r'\n', ' ', regex=True)
        return df.to_markdown(index=False)

    def _extract_images(self, page: fitz.Page) -> List[str]:
        image_list = page.get_images(full=True)
        valid_images = []
        for img in image_list:
            xref = img[0]
            base_image = page.parent.extract_image(xref)
            if base_image["width"] < 50 or base_image["height"] < 50:
                continue
            valid_images.append(f"[Image: {base_image['width']}x{base_image['height']}]")
        return valid_images

    def _extract_complex(self, pdf_path: str, page_index: int) -> Tuple[str, List[pd.DataFrame]]:
        page_text = []
        tables_found = []
        with pdfplumber.open(pdf_path) as pdf:
            p = pdf.pages[page_index]
            for table in p.extract_tables():
                clean_table = [[str(c) if c else "" for c in row] for row in table]
                if clean_table:
                    df = pd.DataFrame(clean_table[1:], columns=clean_table[0])
                    tables_found.append(df)
            page_text.append(p.extract_text() or "")
        return "\n".join(page_text), tables_found

    def process_document(self, file_path: str) -> List[Dict]:
        doc = fitz.open(file_path)
        extracted_pages = []
        
        for i, page in enumerate(doc):
            score = self.calculate_page_complexity(page)
            
            page_content = ""
            valid_images = self._extract_images(page)
            if valid_images:
                page_content += "\n".join(valid_images) + "\n"

            if score > self.complexity_threshold:
                text, tables = self._extract_complex(file_path, i)
                for table_df in tables:
                    if self._pending_table_df is not None:
                        if list(table_df.columns) == list(self._pending_table_df.columns):
                            self._pending_table_df = pd.concat([self._pending_table_df, table_df], ignore_index=True)
                            continue
                        else:
                            page_content += "\n" + self._df_to_markdown(self._pending_table_df) + "\n"
                            self._pending_table_df = None
                    self._pending_table_df = table_df
                page_content += text
            else:
                if self._pending_table_df is not None:
                     page_content += "\n" + self._df_to_markdown(self._pending_table_df) + "\n"
                     self._pending_table_df = None
                page_content += page.get_text("text")

            extracted_pages.append({
                "page_number": i + 1,
                "text": page_content
            })

        if self._pending_table_df is not None:
             extracted_pages[-1]["text"] += "\n" + self._df_to_markdown(self._pending_table_df) + "\n"

        doc.close()
        return extracted_pages