from django.urls import path
from .views import OptionsView
urlpatterns=[path('options/', OptionsView.as_view())]
