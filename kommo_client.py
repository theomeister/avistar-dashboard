import os
import time
import requests


class KommoClient:
    def __init__(self, subdomain=None, token=None):
        self.subdomain = subdomain or os.environ["KOMMO_SUBDOMAIN"]
        self.token = token or os.environ["KOMMO_TOKEN"]
        self.base_url = f"https://{self.subdomain}.kommo.com/api/v4"
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {self.token}"

    def _get(self, path, params=None):
        resp = self.session.get(f"{self.base_url}{path}", params=params, timeout=30)
        resp.raise_for_status()
        if resp.status_code == 204 or not resp.text:
            return {}
        return resp.json()

    def _paginate(self, path, params=None, limit=250):
        params = dict(params or {})
        params["limit"] = limit
        page = 1
        items = []
        while True:
            params["page"] = page
            data = self._get(path, params=params)
            embedded = data.get("_embedded", {})
            key = next(iter(embedded), None)
            page_items = embedded.get(key, []) if key else []
            if not page_items:
                break
            items.extend(page_items)
            if len(page_items) < limit:
                break
            page += 1
            time.sleep(0.12)
        return items

    def get_account(self):
        return self._get("/account")

    def get_pipelines(self):
        data = self._get("/leads/pipelines")
        return data.get("_embedded", {}).get("pipelines", [])

    def get_users(self):
        return self._paginate("/users")

    def get_lead_custom_fields(self):
        return self._paginate("/leads/custom_fields")

    def get_loss_reasons(self):
        data = self._get("/leads/loss_reasons")
        return data.get("_embedded", {}).get("loss_reasons", [])

    def get_all_leads(self):
        return self._paginate("/leads", params={"with": "loss_reason"})
