from rest_framework.throttling import ScopedRateThrottle


class StudentPresenceScopedThrottle(ScopedRateThrottle):
    scope = 'student_presence'
