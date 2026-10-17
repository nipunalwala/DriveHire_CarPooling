"""Pure checks for the approved lean documentation contract."""

def validate_scope(model, contract, screens):
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)

    require(model.get('releaseScope') == 'lean-first-release', 'missing lean release scope')
    require(len(model['phases']) == 9, 'lean roadmap must contain master plus eight milestones')
    operations = {operation['operationId']: (path, method) for path, methods in contract['paths'].items() for method, operation in methods.items()}
    catalog = {item['op']: (item['path'], item['method'].lower()) for item in model['apis']}
    require(catalog == operations, 'API catalogue path/method differs from OpenAPI')
    require(not set(operations).intersection(model['deferred']['operations']), 'deferred operation is active')
    require(not {r['id'] for r in model['requirements']}.intersection(model['deferred']['requirements']), 'deferred requirement is active')
    require(not any(path.startswith('/api/v1/owners') for path in contract['paths']), 'owner subsystem route is active')
    covered = {op for screen in screens for op in screen['ops']}
    require(set(operations) - {'health', 'ready'} <= covered, 'active API has no planned UI surface')
    schemas = contract['components']['schemas']
    for name in ('QuoteInput', 'Quote', 'Booking'):
        require(schemas[name]['properties']['service'].get('enum') == ['DRIVER_HIRE'], f'{name} permits unsupported hire service')
    for name in ('CarpoolInput', 'Carpool'):
        require(schemas[name]['properties']['joinMode'].get('enum') == ['INSTANT'], f'{name} permits approval seats')
    require(schemas['RoleInput']['properties']['role']['enum'] == ['DRIVER'], 'public role grant exceeds DRIVER')
    require(schemas['User']['properties']['roles']['items']['enum'] == ['PASSENGER', 'DRIVER', 'ADMIN'], 'active user roles exceed lean scope')
    require(schemas['SeatRequest']['properties']['status']['enum'] == ['ACCEPTED', 'CANCELLED', 'EXPIRED'], 'seat DTO permits approval states')
    require(schemas['BookingDecision']['properties']['kind']['enum'] == ['DRIVER'], 'owner consent remains active')
    require(schemas['Booking']['properties']['decisions'].get('maxItems') == 1, 'booking permits multiple provider consents')
    forbidden_schemas = {'Owner', 'OwnerInput', 'Review', 'ReviewInput', 'Notification', 'UnreadCount', 'Complaint', 'Report', 'AssignmentInput'}
    require(not forbidden_schemas.intersection(schemas), 'deferred schema remains in OpenAPI')
    for name in ('Driver', 'DriverPrivate', 'Vehicle', 'VehiclePrivate'):
        require(not {'ratingAverage', 'ratingCount'}.intersection(schemas.get(name, {}).get('properties', {})), f'{name} retains review fields')
    for name in ('VehicleInput', 'Vehicle', 'VehiclePrivate'):
        require(not {'hourlyRateMinor', 'listed', 'imageIds'}.intersection(schemas.get(name, {}).get('properties', {})), f'{name} retains rental marketplace fields')
    for name in ('Trip', 'Carpool', 'CarpoolInput'):
        require(not {'waypoints', 'waypointIndex', 'simulation'}.intersection(schemas[name]['properties']), f'{name} retains waypoint tracking')
    require({'hostDisplayName', 'vehicleSummary'} <= set(schemas['Carpool']['properties']), 'public carpool lacks safe embedded summary')
    return errors
