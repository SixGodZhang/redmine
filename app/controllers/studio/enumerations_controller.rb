# frozen_string_literal: true

module Studio
  class EnumerationsController < BaseController
    ALLOWED = %w[IssuePriority DocumentCategory TimeEntryActivity].freeze

    before_action :require_admin
    before_action :find_enumeration, only: [:update, :destroy]

    def index
      field = custom_enumeration_field
      return render json: { errors: ['请选择枚举字段'] }, status: :unprocessable_entity unless field

      render json: { items: field.enumerations.order(:position).map { |item| value_json(item) } }
    end

    def create
      if (field = custom_enumeration_field)
        item = field.enumerations.build
        assign_value(item)
        if item.save
          render json: { enumeration: value_json(item) }, status: :created
        else
          render json: { errors: item.errors.full_messages }, status: :unprocessable_entity
        end
        return
      end

      enum = enumeration_class.new
      enum.active = true
      assign(enum)
      if enum.save
        render json: { enumeration: enumeration_json(enum) }, status: :created
      else
        render json: { errors: enum.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      if (field = custom_enumeration_field)
        item = field.enumerations.find(params[:id])
        assign_value(item)
        if item.save
          render json: { enumeration: value_json(item) }
        else
          render json: { errors: item.errors.full_messages }, status: :unprocessable_entity
        end
        return
      end

      assign(@enumeration)
      if @enumeration.save
        render json: { enumeration: enumeration_json(@enumeration) }
      else
        render json: { errors: @enumeration.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      if (field = custom_enumeration_field)
        item = field.enumerations.find(params[:id])
        if item.in_use?
          render json: { errors: ["「#{item.name}」正在被 #{item.objects_count} 条记录使用，不能删除"] }, status: :unprocessable_entity
          return
        end
        item.destroy
        render json: { ok: true }
        return
      end

      if @enumeration.in_use?
        render json: { errors: ["「#{@enumeration.name}」正在被 #{@enumeration.objects_count} 条记录使用，不能删除"] }, status: :unprocessable_entity
        return
      end
      @enumeration.destroy
      render json: { ok: true }
    end

    def reorder
      if (field = custom_enumeration_field)
        reorder_records(field.enumerations, field.enumerations)
        render json: { ok: true }
        return
      end

      klass = enumeration_class
      reorder_records(klass.shared, klass.shared)
      klass.compute_position_names if klass.respond_to?(:compute_position_names)
      render json: { ok: true }
    end

    private

    def enumeration_class
      name = params[:type].to_s
      raise ActiveRecord::RecordNotFound unless ALLOWED.include?(name)

      name.constantize
    end

    def custom_enumeration_field
      type = params[:type].to_s
      return nil unless type.start_with?('custom_field:')

      field = CustomField.find_by(id: type.split(':', 2).last)
      return nil unless field&.field_format == 'enumeration'

      field
    end

    def find_enumeration
      return if custom_enumeration_field

      @enumeration = enumeration_class.shared.find(params[:id])
    end

    def reorder_records(scope, update_scope)
      ids = Array(params[:ids]).map(&:to_i).uniq
      known = scope.where(id: ids).pluck(:id)
      missing = scope.where.not(id: ids).order(:position).pluck(:id)
      ordered = ids.select { |id| known.include?(id) } + missing
      update_scope.klass.transaction do
        ordered.each_with_index do |id, index|
          update_scope.where(id: id).update_all(position: index + 1)
        end
      end
    end

    def assign_value(item)
      attrs = params[:enumeration] || {}
      item.name = attrs[:name].to_s.strip if attrs.key?(:name)
      item.active = ActiveModel::Type::Boolean.new.cast(attrs[:active]) unless attrs[:active].nil?
    end

    def value_json(item)
      {
        id: item.id,
        name: item.name,
        is_default: false,
        active: item.active?
      }
    end

    def assign(enum)
      attrs = params[:enumeration] || {}
      enum.name = attrs[:name].to_s.strip if attrs.key?(:name)
      enum.active = ActiveModel::Type::Boolean.new.cast(attrs[:active]) unless attrs[:active].nil?
      enum.is_default = ActiveModel::Type::Boolean.new.cast(attrs[:is_default]) unless attrs[:is_default].nil?
    end

    def enumeration_json(enum)
      {
        id: enum.id,
        name: enum.name,
        is_default: enum.is_default?,
        active: enum.active?
      }
    end
  end
end
