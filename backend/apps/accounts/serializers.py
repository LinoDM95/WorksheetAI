from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    class Meta:
        model = User
        fields = ['id','email','first_name','last_name','password']
    def validate_email(self, value):
        if User.objects.filter(username=value.lower()).exists():
            raise serializers.ValidationError('Diese E-Mail ist bereits registriert.')
        return value.lower()
    def create(self, data):
        return User.objects.create_user(username=data['email'], email=data['email'], password=data['password'], first_name=data.get('first_name',''), last_name=data.get('last_name',''))

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id','email','first_name','last_name']
