import fitz
import pdfplumber
import pandas as pd
from typing import List, Tuple, Optional, Dict
from app.services.ocr_service import ocr
from app.core.config import settings

class PDFHandler:
    def __init__(self):
        self._pending_table_df: Optional[pd.DataFrame] = None 
    
    def blocks_complexity_score(self, page, debug_text: bool = False):
        score = 0

        blocks = page.get_text("blocks")
        if len(blocks) > 15:
            score += 3
        elif len(blocks) > 8:
            score += 1

        if debug_text:
            print("blocks: ", len(blocks), score)

        return score

    def drawing_complexity_score(self, page, debug_text: bool = False):
        score = 0
        drawings = page.get_drawings()
        if len(drawings) > 50:
            score += 4
        elif len(drawings) > 25:
            score += 2

        if debug_text:
            print("drawings: ", len(drawings), score)

        return score

    def image_complexity_score(self, page, debug_text: bool = False):
        score = 0
        images = page.get_images(full=True)
        if len(images) > 2:
            score += 2
        elif len(images) > 0:
            score += 1

        if debug_text:
            print("images: ", len(images), score)

        return score
    
    def span_complexity_score(self, page, debug_text: bool = False):
        raw = page.get_text("dict")

        score = 0


        # Collect spans per row
        row_dict = {}  # y -> list of spans

        for block in raw["blocks"]:
            if "lines" not in block:
                continue

            for line in block["lines"]:
                for span in line["spans"]:
                    # mid-point y (y_top + y_bot), no need to divide by 2
                    y_mid = round((span["bbox"][1] + span["bbox"][3]), 1)

                    #! consider adding some tolerance value (epsilon) to account for imperfections
                    # store only the x_left and x_right values
                    row_dict.setdefault(y_mid, []).append([span["bbox"][0], span["bbox"][2]])

        # now row_dict has y -> spans in that row

        #! removed cause it also indicates lists rather than cells
        # # many short spans -> likely table cells
        # if short_spans > 80:
        #     score += 3
        # elif short_spans > 40:
        #     score += 1

        # could indicate table rows or column-level data
        columner_data_count = 0
        heavy_columner_data = 0

        # aligned y positions -> columns
        for _, spans in row_dict.items():
            # merge spans that are horizontally adjacent
            cells_in_row = 0
            spans_sorted = sorted(spans, key=lambda s: s[0])  # sort by x
            last_x1 = -100
            for s in spans_sorted:
                x0, x1 = s[0], s[1]
                if x0 - last_x1 > 2:  # >2 px gap -> new cell
                    cells_in_row += 1
                last_x1 = x1

            if cells_in_row > 1:
                columner_data_count += 1
            if cells_in_row > 3:
                heavy_columner_data += 1

        if columner_data_count > 8:
            score += 3
        elif columner_data_count > 5:
            score += 2
        elif columner_data_count > 2:
            score += 1

        if heavy_columner_data > 2:
            score += 2
        elif heavy_columner_data > 1:
            score += 1

        if debug_text:
            print("Spans: ", columner_data_count, heavy_columner_data, score)
            
        return score

    def calculate_page_complexity(self, page, debug_text: bool = False):
        score = 0

        #! consider training a very simple ML model to adjust the weights
        #! there are also potential improvements by going more in depth
        #! with the drawings, or by using ocr, latex ocr, and/or simple image processing
        #! and maybe a light-weight visual model like detectron2 or something

        # 1. Number of text blocks (multi-column / fragmented layout)
        score += self.blocks_complexity_score(page, debug_text)

        # 2. Vector drawings (table borders, shapes)
        score += self.drawing_complexity_score(page, debug_text)

        # 3. Images
        #! may consider removing this as we handle images seperately
        #! currently kept in case of formatted text under images for explaination
        score += self.image_complexity_score(page, debug_text)

        # --- Span analysis (detect column/table text patterns) ---
        #! currently unsued due to inconsistency in span patterns
        # score += self.span_complexity_score(page)
        
        if debug_text:
            print(f"Page {page.number} complexity: {score}")
        return score

    def _df_to_markdown(self, df: pd.DataFrame) -> str:
        if df.empty: return ""
        df = df.replace(r'\n', ' ', regex=True)
        return df.to_markdown(index=False)

    def _extract_image_text(self, page: fitz.Page) -> List[str]:
        image_list = page.get_images(full=True)
        valid_images = []

        for img in image_list:
            xref = img[0]
            base_image = page.parent.extract_image(xref)

            if base_image["width"] < 50 or base_image["height"] < 50:
                continue

            image_bytes = base_image["image"]
            ocr_text = ocr.extract_text(image_bytes)
            
            valid_images.append(f"[Image with text: {ocr_text}]")
        
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

    def extract_images_data(self, file_path: str):
        doc = fitz.open(file_path)
        extracted_images = []

        for i, page in enumerate(doc):
            image_list = page.get_images(full=True)

            for img in image_list:
                xref = img[0]
                base_image = page.parent.extract_image(xref)

                if base_image["width"] < 50 or base_image["height"] < 50:
                    continue
                extracted_images.append((base_image["image"], i+1))

        return extracted_images

    def process_document(self, file_path: str) -> List[Dict]:
        doc = fitz.open(file_path)
        extracted_pages = []
        
        for i, page in enumerate(doc):
            score = self.calculate_page_complexity(page)
            
            page_content = ""
            valid_images = self._extract_image_text(page)
            if valid_images:
                page_content += "\n".join(valid_images) + "\n"

            if score > settings.pdf_complexity_threshold:
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