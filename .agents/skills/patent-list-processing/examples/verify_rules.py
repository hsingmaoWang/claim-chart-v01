"""
Verification script for patent-list-processing skill rules.
"""

import sys
import os

# Add skill path to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
scripts_dir = os.path.join(parent_dir, "scripts")
if scripts_dir not in sys.path:
    sys.path.insert(0, scripts_dir)

from patent_processor import (
    process_patent_list,
    deduplicate_publication_by_application,
    count_patent_families,
    consolidate_patent_families
)

def run_tests():
    print("=== Testing patent-list-processing skill rules ===")

    # Test dataset
    # Scenario:
    # Family 1 (INPADOC 10001):
    #   - Patent 1A: US2020001A1, App: US16/001, PubDate: 2020-03-01
    #   - Patent 1B: US1099999B2, App: US16/001 (Same App!), PubDate: 2022-08-15 -> Should merge with 1A, keep 1B!
    #   - Patent 1C: TW2020999A,  App: TW109001, PubDate: 2020-05-01
    #   - Patent 1D: EP3500000A1, App: EP19001,  PubDate: 2021-01-10
    #
    # Family 2 (INPADOC 10002):
    #   - Patent 2A: CN1120000A,  App: CN202001, PubDate: 2021-02-01
    #   - Patent 2B: JP2021500A,  App: JP202001, PubDate: 2021-03-01
    #
    # Family 3 (No Family ID):
    #   - Patent 3A: KR1020210A,  App: KR202101, PubDate: 2021-04-01
    test_patents = [
        {
            "Publication Number": "US2020001A1",
            "Application Number": "US16/001",
            "Publication Date": "2020-03-01",
            "INPADOC Family ID": "10001",
            "Title": "Tech 1 Early US Pub"
        },
        {
            "Publication Number": "US1099999B2",
            "Application Number": "US16/001",
            "Publication Date": "2022-08-15",
            "INPADOC Family ID": "10001",
            "Title": "Tech 1 Granted US Patent"
        },
        {
            "Publication Number": "TW2020999A",
            "Application Number": "TW109001",
            "Publication Date": "2020-05-01",
            "INPADOC Family ID": "10001",
            "Title": "Tech 1 TW Pub"
        },
        {
            "Publication Number": "EP3500000A1",
            "Application Number": "EP19001",
            "Publication Date": "2021-01-10",
            "INPADOC Family ID": "10001",
            "Title": "Tech 1 EP Pub"
        },
        {
            "Publication Number": "CN1120000A",
            "Application Number": "CN202001",
            "Publication Date": "2021-02-01",
            "INPADOC Family ID": "10002",
            "Title": "Tech 2 CN Pub"
        },
        {
            "Publication Number": "JP2021500A",
            "Application Number": "JP202001",
            "Publication Date": "2021-03-01",
            "INPADOC Family ID": "10002",
            "Title": "Tech 2 JP Pub"
        },
        {
            "Publication Number": "KR1020210A",
            "Application Number": "KR202101",
            "Publication Date": "2021-04-01",
            "INPADOC Family ID": "",  # Missing family ID
            "Title": "Tech 3 KR Single"
        }
    ]

    print(f"Total raw patents: {len(test_patents)}")

    # 1. Test Rule 1: 公開公告合併
    after_pub_merge = deduplicate_publication_by_application(test_patents)
    print(f"\n[Test Rule 1] After publication merge: {len(after_pub_merge)} patents (Expected: 6)")
    assert len(after_pub_merge) == 6, f"Expected 6, got {len(after_pub_merge)}"
    
    # Check that US1099999B2 is kept and US2020001A1 is discarded
    pub_numbers = [p["Publication Number"] for p in after_pub_merge]
    assert "US1099999B2" in pub_numbers, "US1099999B2 (latest) should be kept"
    assert "US2020001A1" not in pub_numbers, "US2020001A1 (older) should be merged/removed"
    print("-> Rule 1 PASSED: US1099999B2 kept over US2020001A1 based on latest Publication Date (2022-08-15 vs 2020-03-01).")

    # 2. Test Rule 2: 專利家族計數規則 (以步驟 1 為基礎)
    family_stats = count_patent_families(after_pub_merge)
    print(f"\n[Test Rule 2] Family counting summary: {family_stats['summary']}")
    # Families:
    # Family 10001: 3 pieces (US1099999B2, TW2020999A, EP3500000A1) -> 1 案 3 件
    # Family 10002: 2 pieces (CN1120000A, JP2021500A) -> 1 案 2 件
    # Independent KR: 1 piece -> 1 案 1 件
    # Total: 3 案 6 件
    assert family_stats["total_cases"] == 3, f"Expected 3 cases, got {family_stats['total_cases']}"
    assert family_stats["total_pieces"] == 6, f"Expected 6 pieces, got {family_stats['total_pieces']}"
    assert family_stats["summary"] == "3 案 6 件"
    print("-> Rule 2 PASSED: Correctly counted as 3 案 6 件 (Family 10001 is 1 案 3 件).")

    # 3. Test Rule 3: 專利家族合併 (國別優先順序 US > WO > EP > TW > CN > JP > KR)
    consolidated = consolidate_patent_families(after_pub_merge)
    print(f"\n[Test Rule 3] After family consolidation: {len(consolidated)} patents (Expected: 3)")
    assert len(consolidated) == 3, f"Expected 3, got {len(consolidated)}"
    
    consolidated_pubs = {p["Publication Number"] for p in consolidated}
    # For Family 10001: US > EP > TW -> US1099999B2 must be selected
    assert "US1099999B2" in consolidated_pubs, "US must be selected over EP and TW"
    # For Family 10002: CN > JP -> CN1120000A must be selected
    assert "CN1120000A" in consolidated_pubs, "CN must be selected over JP"
    # For Independent KR: KR1020210A must be retained
    assert "KR1020210A" in consolidated_pubs, "KR must be retained"
    print(f"-> Selected representative patents: {consolidated_pubs}")
    print("-> Rule 3 PASSED: Priority order correctly picked US over EP/TW, and CN over JP.")

    # 4. Test End-to-End process_patent_list
    full_result = process_patent_list(test_patents)
    print("\n[End-to-End Pipeline Summary]:")
    print(full_result["stats"])
    assert full_result["stats"]["raw_count"] == 7
    assert full_result["stats"]["after_pub_merge_count"] == 6
    assert full_result["stats"]["family_cases"] == 3
    assert full_result["stats"]["family_pieces"] == 6
    assert full_result["stats"]["consolidated_count"] == 3

    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
