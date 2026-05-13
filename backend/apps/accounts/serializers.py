from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
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


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError(
                {'password_confirm': 'Die Passwörter stimmen nicht überein.'}
            )
        try:
            uid = force_str(urlsafe_base64_decode(attrs['uid']))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError(
                'Der Link ist ungültig oder abgelaufen. Bitte fordere eine neue E-Mail an.'
            )
        if not user.is_active:
            raise serializers.ValidationError(
                'Der Link ist ungültig oder abgelaufen. Bitte fordere eine neue E-Mail an.'
            )
        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError(
                'Der Link ist ungültig oder abgelaufen. Bitte fordere eine neue E-Mail an.'
            )
        attrs['user'] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context['request'].user
        if not user.check_password(attrs['current_password']):
            raise serializers.ValidationError({'current_password': 'Das aktuelle Passwort ist falsch.'})
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError(
                {'new_password_confirm': 'Die neuen Passwörter stimmen nicht überein.'}
            )
        return attrs


class ChangeEmailSerializer(serializers.Serializer):
    new_email = serializers.EmailField()
    current_password = serializers.CharField(write_only=True)

    def validate_new_email(self, value: str) -> str:
        return value.lower().strip()

    def validate(self, attrs):
        user = self.context['request'].user
        if not user.check_password(attrs['current_password']):
            raise serializers.ValidationError({'current_password': 'Das aktuelle Passwort ist falsch.'})
        new_email = attrs['new_email']
        if User.objects.filter(username=new_email).exclude(pk=user.pk).exists():
            raise serializers.ValidationError({'new_email': 'Diese E-Mail ist bereits vergeben.'})
        return attrs


class FinalizeDemoAccountSerializer(serializers.Serializer):
    """Demo-Konto in ein reguläres Konto überführen (gleiche User-PK, Inhalte bleiben)."""

    first_name = serializers.CharField(max_length=150, trim_whitespace=True)
    last_name = serializers.CharField(max_length=150, trim_whitespace=True)
    new_email = serializers.EmailField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)
    current_password = serializers.CharField(write_only=True)

    def validate_new_email(self, value: str) -> str:
        return value.lower().strip()

    def validate(self, attrs):
        if not (attrs.get('first_name') or '').strip():
            raise serializers.ValidationError({'first_name': 'Bitte einen Vornamen angeben.'})
        if not (attrs.get('last_name') or '').strip():
            raise serializers.ValidationError({'last_name': 'Bitte einen Nachnamen angeben.'})
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError(
                {'new_password_confirm': 'Die neuen Passwörter stimmen nicht überein.'}
            )
        user = self.context['request'].user
        if not user.check_password(attrs['current_password']):
            raise serializers.ValidationError({'current_password': 'Das aktuelle Passwort ist falsch.'})
        new_email = attrs['new_email']
        if User.objects.filter(username=new_email).exclude(pk=user.pk).exists():
            raise serializers.ValidationError({'new_email': 'Diese E-Mail ist bereits registriert.'})
        return attrs


class UserSerializer(serializers.ModelSerializer):
    credits_balance = serializers.SerializerMethodField()
    credits_reference_cap = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()
    has_platform_access = serializers.SerializerMethodField()
    is_demo_account = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'first_name',
            'last_name',
            'credits_balance',
            'credits_reference_cap',
            'subscription',
            'has_platform_access',
            'is_demo_account',
            'is_staff',
            'is_superuser',
        ]

    def get_has_platform_access(self, obj: User) -> bool:
        from apps.accounts.services.subscription import user_has_platform_access

        return user_has_platform_access(obj)

    def get_is_demo_account(self, obj: User) -> bool:
        from apps.accounts.services.demo_accounts import profile_is_demo

        return profile_is_demo(obj)

    def get_subscription(self, obj: User) -> dict | None:
        from apps.accounts.services.subscription import get_subscription_api_payload

        return get_subscription_api_payload(obj)

    def get_credits_reference_cap(self, obj: User) -> int:
        from apps.accounts.services.demo_accounts import demo_credit_cap, profile_is_demo
        from apps.accounts.services.subscription import effective_monthly_credit_grant

        if profile_is_demo(obj):
            return int(demo_credit_cap())
        return int(effective_monthly_credit_grant(obj))

    def get_credits_balance(self, obj: User) -> int:
        from apps.accounts.services.credits import get_or_create_balance

        return int(get_or_create_balance(obj).balance)
