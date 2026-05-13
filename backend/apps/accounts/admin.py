from django.contrib import admin

from apps.accounts.models import (
    CreditPackage,
    CreditPurchase,
    SubscriptionPlan,
    UserCreditBalance,
    UserProfile,
    UserSubscription,
)


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ('slug', 'name', 'monthly_credit_grant', 'is_active', 'sort_order')
    list_filter = ('is_active',)
    search_fields = ('slug', 'name')
    ordering = ('sort_order', 'slug')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'is_demo', 'demo_must_set_own_password', 'updated_at')
    list_filter = ('is_demo', 'demo_must_set_own_password')
    search_fields = ('user__email', 'user__username')
    raw_id_fields = ('user',)


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


@admin.register(CreditPackage)
class CreditPackageAdmin(admin.ModelAdmin):
    list_display = ('slug', 'name', 'credits', 'price_cents', 'badge_label', 'highlighted', 'is_active', 'sort_order')
    list_filter = ('is_active', 'highlighted')
    search_fields = ('slug', 'name')
    ordering = ('sort_order', 'slug')


@admin.register(CreditPurchase)
class CreditPurchaseAdmin(admin.ModelAdmin):
    list_display = ('user', 'credits', 'price_cents', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('user__email', 'stripe_session_id', 'stripe_payment_intent_id')
    raw_id_fields = ('user', 'package')
