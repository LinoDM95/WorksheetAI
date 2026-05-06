from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'password']

    def validate_email(self, value):
        if User.objects.filter(username=value.lower()).exists():
            raise serializers.ValidationError('Diese E-Mail ist bereits registriert.')
        return value.lower()

    def create(self, data):
        return User.objects.create_user(
            username=data['email'],
            email=data['email'],
            password=data['password'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
        )


class UserSerializer(serializers.ModelSerializer):
    credits_balance = serializers.SerializerMethodField()
    credits_reference_cap = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'credits_balance', 'credits_reference_cap']

    def get_credits_reference_cap(self, obj: User) -> int:
        return int(getattr(settings, 'USER_CREDITS_REFERENCE_CAP', 10000))

    def get_credits_balance(self, obj: User) -> int:
        from apps.accounts.services.credits import get_or_create_balance

        return int(get_or_create_balance(obj).balance)
