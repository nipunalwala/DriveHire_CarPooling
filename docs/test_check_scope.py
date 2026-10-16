"""Regression tests for scope validation, using altered planning fixtures."""
import copy
import json
import unittest
from pathlib import Path
from check_scope import validate_scope

DOCS = Path(__file__).resolve().parent

class ScopeValidationTests(unittest.TestCase):
    def setUp(self):
        self.model = json.loads((DOCS / 'planning-model.json').read_text(encoding='utf-8'))
        self.contract = json.loads((DOCS / 'api/openapi.json').read_text(encoding='utf-8'))
        self.screens = json.loads((DOCS / 'planning/screens.json').read_text(encoding='utf-8'))

    def errors(self):
        return validate_scope(self.model, self.contract, self.screens)

    def test_current_scope_is_consistent(self):
        self.assertEqual(self.errors(), [])

    def test_rejects_old_service_and_approval_modes(self):
        self.contract['components']['schemas']['QuoteInput']['properties']['service']['enum'].append('COMBINED')
        self.contract['components']['schemas']['CarpoolInput']['properties']['joinMode']['enum'].append('APPROVAL')
        self.assertTrue(any('unsupported hire' in e for e in self.errors()))
        self.assertTrue(any('approval seats' in e for e in self.errors()))

    def test_rejects_deferred_operation_even_if_reintroduced_consistently(self):
        entry = copy.deepcopy(next(iter(self.contract['paths'].values()))['post'])
        entry['operationId'] = 'adminReport'
        self.contract['paths']['/api/v1/admin/reports/summary'] = {'get': entry}
        self.model['apis'].append({'op': 'adminReport', 'path': '/api/v1/admin/reports/summary', 'method': 'GET'})
        self.screens[0]['ops'].append('adminReport')
        self.assertIn('deferred operation is active', self.errors())

    def test_rejects_owner_role_and_multiple_consents(self):
        self.contract['components']['schemas']['RoleInput']['properties']['role']['enum'].append('OWNER')
        self.contract['components']['schemas']['Booking']['properties']['decisions']['maxItems'] = 2
        self.assertIn('public role grant exceeds DRIVER', self.errors())
        self.assertIn('booking permits multiple provider consents', self.errors())

    def test_rejects_catalogue_path_mismatch_and_uncovered_surface(self):
        self.model['apis'][0]['path'] = '/api/v1/wrong'
        self.screens = []
        self.assertIn('API catalogue path/method differs from OpenAPI', self.errors())
        self.assertIn('active API has no planned UI surface', self.errors())

    def test_rejects_deferred_fields_and_missing_public_summary(self):
        schemas = self.contract['components']['schemas']
        schemas['VehicleInput']['properties']['hourlyRateMinor'] = {'type': 'integer'}
        del schemas['Carpool']['properties']['vehicleSummary']
        self.assertTrue(any('rental marketplace fields' in e for e in self.errors()))
        self.assertIn('public carpool lacks safe embedded summary', self.errors())

if __name__ == '__main__':
    unittest.main()
