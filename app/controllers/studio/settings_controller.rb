# frozen_string_literal: true

module Studio
  class SettingsController < BaseController
    before_action :require_admin

    EXPOSED = %w[
      app_title rest_api_enabled default_language self_registration
      login_required lost_password twofa
      issues_export_limit gantt_months_limit
    ].freeze

    def show
      tab = params[:tab].presence || 'general'
      render json: {
        tab: tab,
        settings: EXPOSED.index_with { |name| Setting.send(name) },
        notifiables: Redmine::Notifiable.all.map(&:name)
      }
    end

    def update
      settings = params[:settings].to_unsafe_hash
      errors = Setting.set_all_from_params(settings)
      if errors.blank?
        render json: { ok: true }
      else
        messages = errors.respond_to?(:full_messages) ? errors.full_messages : Array(errors)
        render json: { errors: messages }, status: :unprocessable_entity
      end
    end
  end
end
