from django.contrib import admin

from apps.accounts.models import SubscriptionPlan, UserCreditBalance, UserSubscription


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ('slug', 'name', 'monthly_credit_grant', 'is_active', 'sort_order')
    list_filter = ('is_active',)
    search_fields = ('slug', 'name')
    ordering = ('sort_order', 'slug')


@admin.register(UserSubscription)
class UserSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'plan', 'status', 'current_period_end', 'updated_at')
    list_filter = ('status', 'plan')
    search_fields = ('user__email', 'stripe_subscription_id', 'stripe_customer_id')
    raw_id_fields = ('user',)


@admin.register(UserCreditBalance)
class UserCreditBalanceAdmin(admin.ModelAdmin):
    list_display = ('user', 'balance', 'last_monthly_grant_key', 'updated_at')
    search_fields = ('user__email',)
