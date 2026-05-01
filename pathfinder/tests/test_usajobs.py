from services.retrieval.usajobs import (
    JobPosting,
    Salary,
    parse_search_response,
)


SAMPLE_PAYLOAD = {
    "SearchResult": {
        "SearchResultCount": 2,
        "SearchResultItems": [
            {
                "MatchedObjectDescriptor": {
                    "PositionTitle": "Information Technology Specialist (NETWORK)",
                    "PositionURI": "https://www.usajobs.gov/job/123456",
                    "DepartmentName": "Department of Defense",
                    "OrganizationName": "U.S. Army",
                    "PositionLocation": [
                        {"LocationName": "Boise, Idaho"},
                        {"LocationName": "Mountain Home AFB, Idaho"},
                    ],
                    "PositionLocationDisplay": "Multiple Locations",
                    "PositionRemuneration": [
                        {
                            "MinimumRange": "75000",
                            "MaximumRange": "115000",
                            "RateIntervalCode": "PA",
                        }
                    ],
                    "PublicationStartDate": "2026-04-01T00:00:00",
                    "ApplicationCloseDate": "2026-05-15T23:59:59",
                    "JobCategory": [
                        {"Name": "Information Technology Management", "Code": "2210"}
                    ],
                }
            },
            {
                "MatchedObjectDescriptor": {
                    "PositionTitle": "Police Officer",
                    "PositionURI": "https://www.usajobs.gov/job/789012",
                    "DepartmentName": "Department of Veterans Affairs",
                    "OrganizationName": None,
                    "PositionLocation": [],
                    "PositionLocationDisplay": "Boise, Idaho",
                    "PositionRemuneration": [],
                    "PublicationStartDate": "2026-03-15T00:00:00",
                    "ApplicationCloseDate": None,
                    "JobCategory": [],
                }
            },
        ],
    }
}


def test_parse_returns_two_postings() -> None:
    postings = parse_search_response(SAMPLE_PAYLOAD)
    assert len(postings) == 2
    assert all(isinstance(p, JobPosting) for p in postings)


def test_parse_extracts_first_posting_fields() -> None:
    postings = parse_search_response(SAMPLE_PAYLOAD)
    p = postings[0]
    assert p.title == "Information Technology Specialist (NETWORK)"
    assert p.department == "Department of Defense"
    assert p.agency == "U.S. Army"
    assert p.locations == ["Boise, Idaho", "Mountain Home AFB, Idaho"]
    assert p.salary == Salary(min_amount=75000, max_amount=115000, interval="annual")
    assert p.url == "https://www.usajobs.gov/job/123456"
    assert p.posted_date == "2026-04-01"
    assert p.closes_date == "2026-05-15"
    assert p.job_categories == ["Information Technology Management"]


def test_parse_falls_back_to_display_location_when_position_location_empty() -> None:
    postings = parse_search_response(SAMPLE_PAYLOAD)
    assert postings[1].locations == ["Boise, Idaho"]


def test_parse_handles_missing_optional_fields() -> None:
    postings = parse_search_response(SAMPLE_PAYLOAD)
    p = postings[1]
    assert p.salary is None
    assert p.closes_date is None
    assert p.job_categories == []
    assert p.agency is None


def test_parse_empty_payload() -> None:
    assert parse_search_response({}) == []
    assert parse_search_response({"SearchResult": {}}) == []
    assert parse_search_response({"SearchResult": {"SearchResultItems": []}}) == []


def test_parse_handles_non_annual_interval() -> None:
    payload = {
        "SearchResult": {
            "SearchResultItems": [
                {
                    "MatchedObjectDescriptor": {
                        "PositionTitle": "Hourly Tech",
                        "PositionURI": "https://www.usajobs.gov/job/x",
                        "DepartmentName": "DOD",
                        "PositionLocation": [{"LocationName": "Anywhere"}],
                        "PositionRemuneration": [
                            {
                                "MinimumRange": "30",
                                "MaximumRange": "45",
                                "RateIntervalCode": "PH",
                            }
                        ],
                        "PublicationStartDate": "2026-04-01T00:00:00",
                        "JobCategory": [],
                    }
                }
            ]
        }
    }
    p = parse_search_response(payload)[0]
    assert p.salary == Salary(min_amount=30, max_amount=45, interval="hourly")
