# frozen_string_literal: true

module Studio
  class TrackersController < BaseController
    before_action :require_admin
    before_action :find_tracker, only: [:update, :destroy]

    def create
      tracker = Tracker.new(default_status: IssueStatus.sorted.first)
      attributes = params[:tracker]
      attributes = attributes.except(:default_status_id) if attributes.respond_to?(:except) && attributes[:default_status_id].blank?
      tracker.safe_attributes = attributes
      if tracker.save
        if params[:copy_workflow_from].present? && (copy_from = Tracker.find_by_id(params[:copy_workflow_from]))
          tracker.copy_workflow_rules(copy_from)
        end
        render json: { tracker: tracker_json(tracker) }, status: :created
      else
        render json: { errors: tracker.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      @tracker.safe_attributes = params[:tracker]
      if @tracker.save
        render json: { tracker: tracker_json(@tracker) }
      else
        render json: { errors: @tracker.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      if @tracker.issues.any?
        render json: { errors: [l(:error_can_not_delete_tracker)] }, status: :unprocessable_entity
      else
        @tracker.destroy
        render json: { ok: true }
      end
    end

    private

    def find_tracker
      @tracker = Tracker.find(params[:id])
    end

    def tracker_json(tracker)
      {
        id: tracker.id,
        name: tracker.name,
        default_status_id: tracker.default_status_id,
        description: tracker.description
      }
    end
  end
end
